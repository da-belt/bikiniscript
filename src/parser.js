'use strict';

// ─── Parser ──────────────────────────────────────────────────────────────────
// Recursive descent parser. Consumes a flat token list and produces an AST.
//
// Grammar (simplified):
//   program      → statement* EOF
//   statement    → varDecl | funcDecl | classDecl | ifStmt | forStmt
//                | returnStmt | block | exprStmt
//   expression   → assignment → logicOr → logicAnd → equality
//                → comparison → addition → multiplication → unary
//                → postfix → call → primary

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos    = 0;
  }

  // ── Primitives ─────────────────────────────────────────────────────────────
  peek()           { return this.tokens[this.pos]; }
  previous()       { return this.tokens[this.pos - 1]; }
  isAtEnd()        { return this.peek().type === 'EOF'; }
  advance()        { if (!this.isAtEnd()) this.pos++; return this.previous(); }
  check(type)      { return !this.isAtEnd() && this.peek().type === type; }

  match(...types) {
    for (const t of types) { if (this.check(t)) { this.advance(); return true; } }
    return false;
  }

  consume(type, msg) {
    if (this.check(type)) return this.advance();
    const tok = this.peek();
    throw new Error(`Line ${tok.line}: ${msg} — got ${tok.type}('${tok.value}')`);
  }

  // ── Entry ──────────────────────────────────────────────────────────────────
  parse() {
    const stmts = [];
    while (!this.isAtEnd()) stmts.push(this.statement());
    return { type: 'Program', stmts };
  }

  // ── Statements ─────────────────────────────────────────────────────────────
  statement() {
    if (this.match('KRABBY'))       return this.varDecl();
    if (this.match('SPATULA'))      return this.funcDecl();
    if (this.match('CRUSTY'))       return this.classDecl();
    if (this.match('AYE_AYE'))      return this.ifStmt();
    if (this.match('JELLYFISHING')) return this.forStmt();
    if (this.match('GIVE_BACK'))    return this.returnStmt();
    if (this.match('LBRACE'))       return this.blockBody();
    return this.exprStmt();
  }

  // krabby name = expr
  varDecl() {
    const line = this.previous().line;
    const name = this.consume('IDENTIFIER', "Expected variable name after 'krabby'").value;
    this.consume('ASSIGN', `Expected '=' after variable name '${name}'`);
    const init = this.expression();
    return { type: 'VarDecl', name, init, line };
  }

  // spatula name(params) { body }
  funcDecl() {
    const line = this.previous().line;
    const name = this.consume('IDENTIFIER', "Expected function name after 'spatula'").value;
    this.consume('LPAREN', `Expected '(' after function name '${name}'`);
    const params = this.paramList();
    this.consume('RPAREN', "Expected ')' after parameters");
    this.consume('LBRACE', "Expected '{' before function body");
    const body = this.blockBody();
    return { type: 'FuncDecl', name, params, body, line };
  }

  // crusty ClassName { spatula methods... }
  classDecl() {
    const line = this.previous().line;
    const name = this.consume('IDENTIFIER', "Expected class name after 'crusty'").value;
    this.consume('LBRACE', "Expected '{' after class name");
    const methods = [];
    while (!this.check('RBRACE') && !this.isAtEnd()) {
      this.consume('SPATULA', "Expected 'spatula' for method in class body");
      methods.push(this.funcDecl());
    }
    this.consume('RBRACE', "Expected '}' after class body");
    return { type: 'ClassDecl', name, methods, line };
  }

  // aye aye (cond) { ... } nay nay aye aye (...) { ... } nay nay { ... }
  ifStmt() {
    const line = this.previous().line;
    this.consume('LPAREN', "Expected '(' after 'aye aye'");
    const cond = this.expression();
    this.consume('RPAREN', "Expected ')' after condition");
    this.consume('LBRACE', "Expected '{' before if-body");
    const then = this.blockBody();

    let elseClause = null;
    if (this.match('NAY_NAY')) {
      if (this.match('AYE_AYE')) {
        // else-if chain: recurse
        elseClause = this.ifStmt();
      } else {
        this.consume('LBRACE', "Expected '{' after 'nay nay'");
        elseClause = this.blockBody();
      }
    }

    return { type: 'IfStmt', cond, then, elseClause, line };
  }

  // jellyfishing (init; cond; update) { body }
  forStmt() {
    const line = this.previous().line;
    this.consume('LPAREN', "Expected '(' after 'jellyfishing'");

    // Init clause
    let init = null;
    if (!this.check('SEMICOLON')) {
      if (this.match('KRABBY')) {
        init = this.varDecl();
      } else {
        init = { type: 'ExprStmt', expr: this.expression() };
      }
    }
    this.consume('SEMICOLON', "Expected ';' after loop initializer");

    // Condition
    let cond = null;
    if (!this.check('SEMICOLON')) cond = this.expression();
    this.consume('SEMICOLON', "Expected ';' after loop condition");

    // Update
    let update = null;
    if (!this.check('RPAREN')) update = this.expression();
    this.consume('RPAREN', "Expected ')' after loop clauses");
    this.consume('LBRACE', "Expected '{' before loop body");
    const body = this.blockBody();

    return { type: 'ForStmt', init, cond, update, body, line };
  }

  // give back [expr]
  returnStmt() {
    const line = this.previous().line;
    // If the next token could start an expression, parse it
    let value = null;
    if (!this.check('RBRACE') && !this.check('EOF')) {
      value = this.expression();
    }
    return { type: 'ReturnStmt', value, line };
  }

  // { stmts... }  — '{'  already consumed by caller
  blockBody() {
    const stmts = [];
    while (!this.check('RBRACE') && !this.isAtEnd()) stmts.push(this.statement());
    this.consume('RBRACE', "Expected '}' after block");
    return { type: 'Block', stmts };
  }

  exprStmt() {
    return { type: 'ExprStmt', expr: this.expression() };
  }

  // ── Expressions ────────────────────────────────────────────────────────────
  expression() { return this.assignment(); }

  assignment() {
    const expr = this.logicOr();

    // Simple assignment: x = ...
    if (this.match('ASSIGN')) {
      const value = this.assignment(); // right-associative
      if (expr.type === 'Identifier') {
        return { type: 'Assign', name: expr.name, value, line: expr.line };
      }
      if (expr.type === 'Member') {
        return { type: 'MemberAssign', object: expr.object, prop: expr.prop, value, line: expr.line };
      }
      throw new Error(`Line ${expr.line}: Invalid assignment target`);
    }

    // Compound assignment: x += ...  x -= ...  and  obj.prop += ...
    if (this.match('PLUS_ASSIGN', 'MINUS_ASSIGN')) {
      const op  = this.previous().type === 'PLUS_ASSIGN' ? '+' : '-';
      const rhs = this.assignment();
      if (expr.type === 'Identifier') {
        const computed = { type: 'Binary', left: expr, op, right: rhs, line: expr.line };
        return { type: 'Assign', name: expr.name, value: computed, line: expr.line };
      }
      if (expr.type === 'Member') {
        const computed = { type: 'Binary', left: expr, op, right: rhs, line: expr.line };
        return { type: 'MemberAssign', object: expr.object, prop: expr.prop, value: computed, line: expr.line };
      }
      throw new Error(`Line ${expr.line}: Invalid compound assignment target`);
    }

    return expr;
  }

  logicOr() {
    let left = this.logicAnd();
    while (this.match('OR')) {
      left = { type: 'Binary', left, op: '||', right: this.logicAnd(), line: left.line };
    }
    return left;
  }

  logicAnd() {
    let left = this.equality();
    while (this.match('AND')) {
      left = { type: 'Binary', left, op: '&&', right: this.equality(), line: left.line };
    }
    return left;
  }

  equality() {
    let left = this.comparison();
    while (this.match('EQEQ', 'NEQ')) {
      const op = this.previous().type === 'EQEQ' ? '==' : '!=';
      left = { type: 'Binary', left, op, right: this.comparison(), line: left.line };
    }
    return left;
  }

  comparison() {
    let left = this.addition();
    const ops = { LT: '<', GT: '>', LTE: '<=', GTE: '>=' };
    while (this.match('LT', 'GT', 'LTE', 'GTE')) {
      const op = ops[this.previous().type];
      left = { type: 'Binary', left, op, right: this.addition(), line: left.line };
    }
    return left;
  }

  addition() {
    let left = this.multiplication();
    while (this.match('PLUS', 'MINUS')) {
      const op = this.previous().type === 'PLUS' ? '+' : '-';
      left = { type: 'Binary', left, op, right: this.multiplication(), line: left.line };
    }
    return left;
  }

  multiplication() {
    let left = this.unary();
    const ops = { STAR: '*', SLASH: '/', PERCENT: '%' };
    while (this.match('STAR', 'SLASH', 'PERCENT')) {
      const op = ops[this.previous().type];
      left = { type: 'Binary', left, op, right: this.unary(), line: left.line };
    }
    return left;
  }

  unary() {
    if (this.match('BANG'))  return { type: 'Unary', op: '!', right: this.unary(), line: this.previous().line };
    if (this.match('MINUS')) return { type: 'Unary', op: '-', right: this.unary(), line: this.previous().line };
    return this.postfix();
  }

  // Handle i++ and i--
  postfix() {
    let expr = this.callExpr();
    if (this.match('PLUS_PLUS'))   return { type: 'Postfix', expr, op: '++', line: this.previous().line };
    if (this.match('MINUS_MINUS')) return { type: 'Postfix', expr, op: '--', line: this.previous().line };
    return expr;
  }

  // Handle function calls, method calls, member access, and indexing
  callExpr() {
    let expr = this.primary();

    while (true) {
      if (this.match('LPAREN')) {
        // Regular function call:  expr(args)
        const args = this.argList();
        this.consume('RPAREN', "Expected ')' after arguments");
        expr = { type: 'Call', callee: expr, args, line: expr.line };

      } else if (this.match('DOT')) {
        // Property access:  expr.prop  or  expr.method(args)
        const prop = this.consume('IDENTIFIER', "Expected property name after '.'").value;
        const line = this.previous().line;
        if (this.match('LPAREN')) {
          // Method call:  expr.method(args)
          const args = this.argList();
          this.consume('RPAREN', "Expected ')' after method arguments");
          expr = { type: 'MethodCall', object: expr, method: prop, args, line };
        } else {
          // Property read:  expr.prop
          expr = { type: 'Member', object: expr, prop, line };
        }

      } else if (this.match('LBRACKET')) {
        // Index access:  expr[index]
        const index = this.expression();
        this.consume('RBRACKET', "Expected ']' after index");
        expr = { type: 'Index', object: expr, index, line: expr.line };

      } else {
        break;
      }
    }

    return expr;
  }

  argList() {
    const args = [];
    if (!this.check('RPAREN')) {
      do { args.push(this.expression()); } while (this.match('COMMA'));
    }
    return args;
  }

  paramList() {
    const params = [];
    if (!this.check('RPAREN')) {
      do { params.push(this.consume('IDENTIFIER', 'Expected parameter name').value); }
      while (this.match('COMMA'));
    }
    return params;
  }

  // ── Primary expressions ────────────────────────────────────────────────────
  primary() {
    const line = this.peek().line;

    // Numeric literal
    if (this.match('NUMBER')) return { type: 'Literal', value: this.previous().value, line };

    // String literal
    if (this.match('STRING')) return { type: 'Literal', value: this.previous().value, line };

    // Boolean literals
    if (this.match('AYE'))   return { type: 'Literal', value: true,  line };
    if (this.match('NAY'))   return { type: 'Literal', value: false, line };

    // Null literal
    if (this.match('PLANKTON')) return { type: 'Literal', value: null, line };

    // self (this)
    if (this.match('SELF')) return { type: 'Identifier', name: 'self', line };

    // shout — treat as a callable identifier backed by a built-in
    if (this.match('SHOUT')) return { type: 'Identifier', name: 'shout', line };

    // NetBag[] or NetBag[elem, ...]  — typed array literal
    if (this.match('NETBAG')) {
      this.consume('LBRACKET', "Expected '[' after NetBag");
      const elements = [];
      if (!this.check('RBRACKET')) {
        do { elements.push(this.expression()); } while (this.match('COMMA'));
      }
      this.consume('RBRACKET', "Expected ']' after NetBag contents");
      return { type: 'ArrayLit', elements, line };
    }

    // [elem, ...]  — bare array literal
    if (this.match('LBRACKET')) {
      const elements = [];
      if (!this.check('RBRACKET')) {
        do { elements.push(this.expression()); } while (this.match('COMMA'));
      }
      this.consume('RBRACKET', "Expected ']'");
      return { type: 'ArrayLit', elements, line };
    }

    // crusty ClassName(args)  — class instantiation inside an expression
    if (this.match('CRUSTY')) {
      const name = this.consume('IDENTIFIER', "Expected class name after 'crusty'").value;
      this.consume('LPAREN', "Expected '(' for class instantiation");
      const args = this.argList();
      this.consume('RPAREN', "Expected ')'");
      return { type: 'New', className: name, args, line };
    }

    // Regular identifier
    if (this.match('IDENTIFIER')) return { type: 'Identifier', name: this.previous().value, line };

    // Grouped expression: (expr)
    if (this.match('LPAREN')) {
      const expr = this.expression();
      this.consume('RPAREN', "Expected ')'");
      return expr;
    }

    const tok = this.peek();
    throw new Error(`Line ${tok.line}: Tartar sauce! Unexpected token '${tok.type}' ('${tok.value}')`);
  }
}

module.exports = { Parser };
