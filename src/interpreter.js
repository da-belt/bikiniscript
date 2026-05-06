'use strict';

// ─── Environment (Scope) ─────────────────────────────────────────────────────
class Environment {
  constructor(parent = null) {
    this.vars   = new Map();
    this.parent = parent;
  }

  define(name, value) {
    this.vars.set(name, value);
  }

  get(name, line) {
    if (this.vars.has(name)) return this.vars.get(name);
    if (this.parent)         return this.parent.get(name, line);
    throw new RuntimeError(`Barnacles! '${name}' is not defined`, line);
  }

  set(name, value, line) {
    if (this.vars.has(name)) { this.vars.set(name, value); return; }
    if (this.parent)         { this.parent.set(name, value, line); return; }
    throw new RuntimeError(`Barnacles! '${name}' is not defined — you can't set what doesn't exist!`, line);
  }
}

// ─── Signal for unwinding the call stack on return ───────────────────────────
class ReturnSignal {
  constructor(value) { this.value = value; }
}

// ─── Runtime error ───────────────────────────────────────────────────────────
class RuntimeError extends Error {
  constructor(msg, line) { super(msg); this.line = line; this.name = 'RuntimeError'; }
}

// ─── User-defined function ───────────────────────────────────────────────────
class BikiniFunction {
  constructor(name, params, body, closure) {
    this.name    = name;
    this.params  = params;
    this.body    = body;
    this.closure = closure; // the environment where the function was *defined*
  }

  call(interpreter, args) {
    const env = new Environment(this.closure);
    this.params.forEach((p, i) => env.define(p, args[i] ?? null));
    return interpreter.execBlock(this.body.stmts, env);
  }
}

// ─── Class definition ────────────────────────────────────────────────────────
class BikiniClass {
  constructor(name, methodNodes, closure) {
    this.name        = name;
    this.methodNodes = new Map(methodNodes.map(m => [m.name, m]));
    this.closure     = closure;
  }

  instantiate(interpreter, args) {
    const instance = new BikiniInstance(this);
    const ctorNode = this.methodNodes.get('new');
    if (ctorNode) {
      const env = new Environment(this.closure);
      env.define('self', instance);
      ctorNode.params.forEach((p, i) => env.define(p, args[i] ?? null));
      interpreter.execBlock(ctorNode.body.stmts, env);
    }
    return instance;
  }

  getMethod(name) { return this.methodNodes.get(name) ?? null; }
}

// ─── Class instance ──────────────────────────────────────────────────────────
class BikiniInstance {
  constructor(klass) {
    this.klass  = klass;
    this.fields = new Map();
  }

  getProp(name, line) {
    if (this.fields.has(name)) return this.fields.get(name);
    if (this.klass.getMethod(name)) return this.klass.getMethod(name); // method reference
    throw new RuntimeError(`Holy mother of pearl! No property '${name}' on ${this.klass.name}`, line);
  }

  setProp(name, value) { this.fields.set(name, value); }

  toString() { return `<${this.klass.name} instance>`; }
}

// ─── Interpreter ─────────────────────────────────────────────────────────────
class Interpreter {
  constructor(tts = null) {
    this.globals = new Environment();
    this.tts     = tts;
    this._registerBuiltins();
  }

  _registerBuiltins() {
    const g = this.globals;

    // shout(...) — print to stdout and queue TTS narration
    g.define('shout', { isFn: true, call: (interp, args) => {
      const text = args.map(a => interp.stringify(a)).join(' ');
      console.log(text);
      if (interp.tts) interp.tts.enqueue(text);
      return null;
    }});

    // mumble(...) — print to stdout only, no TTS
    g.define('mumble', { isFn: true, call: (interp, args) => {
      const text = args.map(a => interp.stringify(a)).join(' ');
      console.log(text);
      return null;
    }});

    // input() — read a line (synchronous via REPL workaround)
    g.define('listen', { isFn: true, call: (_interp, _args) => null });

    // Math helpers
    g.define('mathFloor',  { isFn: true, call: (_, a) => Math.floor(a[0]) });
    g.define('mathCeil',   { isFn: true, call: (_, a) => Math.ceil(a[0])  });
    g.define('mathRound',  { isFn: true, call: (_, a) => Math.round(a[0]) });
    g.define('mathAbs',    { isFn: true, call: (_, a) => Math.abs(a[0])   });
    g.define('mathSqrt',   { isFn: true, call: (_, a) => Math.sqrt(a[0])  });
    g.define('mathMax',    { isFn: true, call: (_, a) => Math.max(...a)    });
    g.define('mathMin',    { isFn: true, call: (_, a) => Math.min(...a)    });
    g.define('mathRandom', { isFn: true, call: ()     => Math.random()     });

    // Type checks
    g.define('isNumber',  { isFn: true, call: (_, a) => typeof a[0] === 'number'  });
    g.define('isString',  { isFn: true, call: (_, a) => typeof a[0] === 'string'  });
    g.define('isAye',     { isFn: true, call: (_, a) => typeof a[0] === 'boolean' });
    g.define('isNetBag',  { isFn: true, call: (_, a) => Array.isArray(a[0])       });

    // Conversions
    g.define('toNumber', { isFn: true, call: (_, a) => Number(a[0]) });
    g.define('toString', { isFn: true, call: (interp, a) => interp.stringify(a[0]) });
  }

  // ── Entry point ──────────────────────────────────────────────────────────
  run(program) {
    for (const stmt of program.stmts) {
      const result = this.execStmt(stmt, this.globals);
      if (result instanceof ReturnSignal) return result.value;
    }
    return null;
  }

  // ── Block execution ────────────────────────────────────────────────────────
  execBlock(stmts, env) {
    for (const stmt of stmts) {
      const result = this.execStmt(stmt, env);
      if (result instanceof ReturnSignal) return result; // propagate upward
    }
    return null;
  }

  // ── Statement execution ────────────────────────────────────────────────────
  execStmt(node, env) {
    switch (node.type) {

      case 'VarDecl': {
        const val = this.eval(node.init, env);
        env.define(node.name, val);
        return null;
      }

      case 'FuncDecl': {
        env.define(node.name, new BikiniFunction(node.name, node.params, node.body, env));
        return null;
      }

      case 'ClassDecl': {
        env.define(node.name, new BikiniClass(node.name, node.methods, env));
        return null;
      }

      case 'IfStmt': {
        if (this.isTruthy(this.eval(node.cond, env))) {
          return this.execBlock(node.then.stmts, new Environment(env));
        } else if (node.elseClause) {
          if (node.elseClause.type === 'IfStmt') {
            return this.execStmt(node.elseClause, env);             // else-if
          } else {
            return this.execBlock(node.elseClause.stmts, new Environment(env)); // else
          }
        }
        return null;
      }

      case 'ForStmt': {
        const loopEnv = new Environment(env);
        if (node.init) this.execStmt(node.init, loopEnv);

        while (node.cond === null || this.isTruthy(this.eval(node.cond, loopEnv))) {
          const result = this.execBlock(node.body.stmts, new Environment(loopEnv));
          if (result instanceof ReturnSignal) return result; // return inside loop
          if (node.update) this.eval(node.update, loopEnv);
        }
        return null;
      }

      case 'ReturnStmt': {
        const val = node.value ? this.eval(node.value, env) : null;
        return new ReturnSignal(val);
      }

      case 'Block': {
        return this.execBlock(node.stmts, new Environment(env));
      }

      case 'ExprStmt': {
        this.eval(node.expr, env);
        return null;
      }

      default:
        throw new RuntimeError(`Unknown statement type: ${node.type}`, node.line);
    }
  }

  // ── Expression evaluation ──────────────────────────────────────────────────
  eval(node, env) {
    switch (node.type) {

      // ── Literals ────────────────────────────────────────────────────────
      case 'Literal':   return node.value;

      case 'ArrayLit':  return node.elements.map(e => this.eval(e, env));

      // ── Variable lookup ─────────────────────────────────────────────────
      case 'Identifier': return env.get(node.name, node.line);

      // ── Variable assignment ─────────────────────────────────────────────
      case 'Assign': {
        const val = this.eval(node.value, env);
        env.set(node.name, val, node.line);
        return val;
      }

      // ── Member assignment: self.x = val  or  obj.prop = val ─────────────
      case 'MemberAssign': {
        const obj = this.eval(node.object, env);
        const val = this.eval(node.value, env);
        if (obj instanceof BikiniInstance) { obj.setProp(node.prop, val); return val; }
        if (Array.isArray(obj))             { obj[node.prop] = val;        return val; }
        throw new RuntimeError(`Cannot set property '${node.prop}' on ${this.stringify(obj)}`, node.line);
      }

      // ── Property read: obj.prop ─────────────────────────────────────────
      case 'Member': {
        const obj = this.eval(node.object, env);
        return this.getMember(obj, node.prop, node.line);
      }

      // ── Array index: arr[i] ─────────────────────────────────────────────
      case 'Index': {
        const obj = this.eval(node.object, env);
        const idx = this.eval(node.index, env);
        if (Array.isArray(obj)) return obj[idx] ?? null;
        if (typeof obj === 'string') return obj[idx] ?? null;
        throw new RuntimeError(`Cannot index into ${this.stringify(obj)}`, node.line);
      }

      // ── Function call: f(args) ───────────────────────────────────────────
      case 'Call': {
        const callee = this.eval(node.callee, env);
        const args   = node.args.map(a => this.eval(a, env));
        return this.callFunction(callee, args, node.line);
      }

      // ── Method call: obj.method(args) ───────────────────────────────────
      case 'MethodCall': {
        const obj  = this.eval(node.object, env);
        const args = node.args.map(a => this.eval(a, env));
        return this.callMethod(obj, node.method, args, node.line);
      }

      // ── Class instantiation: crusty Foo(args) ────────────────────────────
      case 'New': {
        const cls = env.get(node.className, node.line);
        if (!(cls instanceof BikiniClass)) {
          throw new RuntimeError(`'${node.className}' is not a class`, node.line);
        }
        const args = node.args.map(a => this.eval(a, env));
        return cls.instantiate(this, args);
      }

      // ── Binary operations ────────────────────────────────────────────────
      case 'Binary': return this.evalBinary(node, env);

      // ── Unary operations ─────────────────────────────────────────────────
      case 'Unary': {
        const right = this.eval(node.right, env);
        if (node.op === '!') return !this.isTruthy(right);
        if (node.op === '-') return -Number(right);
        throw new RuntimeError(`Unknown unary operator: ${node.op}`, node.line);
      }

      // ── Postfix: i++ / i-- ───────────────────────────────────────────────
      case 'Postfix': {
        if (node.expr.type !== 'Identifier') {
          throw new RuntimeError("'++' and '--' only work on variables", node.line);
        }
        const old    = env.get(node.expr.name, node.line);
        const newVal = node.op === '++' ? old + 1 : old - 1;
        env.set(node.expr.name, newVal, node.line);
        return old; // postfix returns OLD value (standard behaviour)
      }

      default:
        throw new RuntimeError(`Unknown expression type: ${node.type}`, node.line);
    }
  }

  // ── Binary expression evaluation ───────────────────────────────────────────
  evalBinary(node, env) {
    const op = node.op;

    // Short-circuit logical operators
    if (op === '&&') {
      const l = this.eval(node.left, env);
      return this.isTruthy(l) ? this.eval(node.right, env) : l;
    }
    if (op === '||') {
      const l = this.eval(node.left, env);
      return this.isTruthy(l) ? l : this.eval(node.right, env);
    }

    const left  = this.eval(node.left, env);
    const right = this.eval(node.right, env);

    switch (op) {
      case '+':
        // String concatenation if either side is a string
        if (typeof left === 'string' || typeof right === 'string')
          return this.stringify(left) + this.stringify(right);
        return left + right;
      case '-':  return left - right;
      case '*':  return left * right;
      case '/':
        if (right === 0) throw new RuntimeError('Holy mother of pearl! Division by zero!', node.line);
        return left / right;
      case '%':  return left % right;
      case '==': return left === right;
      case '!=': return left !== right;
      case '<':  return left < right;
      case '>':  return left > right;
      case '<=': return left <= right;
      case '>=': return left >= right;
      default:
        throw new RuntimeError(`Unknown binary operator: '${op}'`, node.line);
    }
  }

  // ── Member / property access helpers ──────────────────────────────────────
  getMember(obj, prop, line) {
    // Array (NetBag) built-in properties and methods
    if (Array.isArray(obj)) {
      if (prop === 'length') return obj.length;
      if (prop === 'push')   return { isFn: true, call: (_, args) => { obj.push(...args); return null; } };
      if (prop === 'pop')    return { isFn: true, call: ()        => obj.pop() ?? null };
      if (prop === 'join')   return { isFn: true, call: (_, args) => obj.join(args[0] ?? ',') };
      if (prop === 'indexOf')return { isFn: true, call: (_, args) => obj.indexOf(args[0]) };
      if (prop === 'slice')  return { isFn: true, call: (_, args) => obj.slice(...args) };
      if (prop === 'reverse')return { isFn: true, call: ()        => { obj.reverse(); return null; } };
      if (prop === 'includes')return { isFn: true, call: (_, args) => obj.includes(args[0]) };
      if (typeof obj[prop] !== 'undefined') return obj[prop];
      throw new RuntimeError(`NetBag has no property '${prop}'`, line);
    }

    // String built-in properties and methods
    if (typeof obj === 'string') {
      if (prop === 'length')     return obj.length;
      if (prop === 'toUpperCase') return { isFn: true, call: () => obj.toUpperCase() };
      if (prop === 'toLowerCase') return { isFn: true, call: () => obj.toLowerCase() };
      if (prop === 'trim')        return { isFn: true, call: () => obj.trim() };
      if (prop === 'includes')    return { isFn: true, call: (_, a) => obj.includes(a[0]) };
      if (prop === 'split')       return { isFn: true, call: (_, a) => obj.split(a[0] ?? '') };
      if (prop === 'startsWith')  return { isFn: true, call: (_, a) => obj.startsWith(a[0]) };
      if (prop === 'endsWith')    return { isFn: true, call: (_, a) => obj.endsWith(a[0]) };
      if (prop === 'indexOf')     return { isFn: true, call: (_, a) => obj.indexOf(a[0]) };
      throw new RuntimeError(`String has no property '${prop}'`, line);
    }

    // Class instance fields and methods
    if (obj instanceof BikiniInstance) return obj.getProp(prop, line);

    throw new RuntimeError(
      `Cannot read property '${prop}' on ${this.stringify(obj)}`, line
    );
  }

  // ── Function call dispatch ─────────────────────────────────────────────────
  callFunction(fn, args, line) {
    // Built-in ({ isFn, call })
    if (fn && fn.isFn && typeof fn.call === 'function') {
      return fn.call(this, args) ?? null;
    }
    // User-defined BikiniFunction
    if (fn instanceof BikiniFunction) {
      const result = fn.call(this, args);
      if (result instanceof ReturnSignal) return result.value;
      return null;
    }
    throw new RuntimeError(
      `Tartar sauce! '${this.stringify(fn)}' is not callable`, line
    );
  }

  // ── Method call dispatch ───────────────────────────────────────────────────
  callMethod(obj, method, args, line) {
    // Arrays and strings — delegate to getMember built-ins
    if (Array.isArray(obj) || typeof obj === 'string') {
      const fn = this.getMember(obj, method, line);
      return this.callFunction(fn, args, line);
    }

    // Class instance methods
    if (obj instanceof BikiniInstance) {
      const methodNode = obj.klass.getMethod(method);
      if (methodNode) {
        const env = new Environment(obj.klass.closure);
        env.define('self', obj);
        methodNode.params.forEach((p, i) => env.define(p, args[i] ?? null));
        const result = this.execBlock(methodNode.body.stmts, env);
        if (result instanceof ReturnSignal) return result.value;
        return null;
      }
      // Maybe it's a field that holds a callable
      const field = obj.fields.get(method);
      if (field) return this.callFunction(field, args, line);
      throw new RuntimeError(
        `No method '${method}' on ${obj.klass.name}`, line
      );
    }

    throw new RuntimeError(
      `Cannot call method '${method}' on ${this.stringify(obj)}`, line
    );
  }

  // ── Truthiness ────────────────────────────────────────────────────────────
  isTruthy(val) {
    if (val === null || val === undefined) return false;
    if (typeof val === 'boolean') return val;
    if (typeof val === 'number')  return val !== 0;
    if (typeof val === 'string')  return val.length > 0;
    return true;
  }

  // ── Human-readable value stringification ──────────────────────────────────
  stringify(val) {
    if (val === null || val === undefined) return 'plankton';
    if (typeof val === 'boolean') return val ? 'aye' : 'nay';
    if (Array.isArray(val)) return '[' + val.map(v => this.stringify(v)).join(', ') + ']';
    if (val instanceof BikiniInstance) return val.toString();
    if (val instanceof BikiniFunction) return `<spatula ${val.name}>`;
    if (val instanceof BikiniClass)    return `<crusty ${val.name}>`;
    return String(val);
  }
}

module.exports = { Interpreter, RuntimeError };
