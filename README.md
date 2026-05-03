# 🧽 BikiniScript

> *"I'm ready! I'm ready to code!"* — SpongeBob SquarePants

A Sponge-tacular programming language for the bottom of the sea.
BikiniScript is a fully working tree-walking interpreter written in Node.js.

---

## 📁 Project Structure

```
bikiniscript/
├── src/
│   ├── lexer.js          ← Tokenizer (source → tokens)
│   ├── parser.js         ← Parser    (tokens → AST)
│   └── interpreter.js    ← Evaluator (AST → output)
├── bin/
│   └── bikiniscript.js   ← CLI entry point + REPL
├── examples/
│   ├── fizzbuzz.bs       ← FizzBuzz (Krabby Patty edition)
│   ├── hello.bs          ← Hello, Bikini Bottom!
│   ├── krusty.bs         ← Classes + arrays
│   └── fibonacci.bs      ← Recursion
├── .vscode/
│   ├── launch.json       ← Run/debug configs
│   ├── settings.json     ← .bs file association
│   └── extensions.json   ← Recommended extensions
└── package.json
```

---

## 🚀 Getting Started in VS Code

### Step 1 — Prerequisites

Make sure you have **Node.js** installed:

```bash
node --version   # should be v16 or higher
```

Download from https://nodejs.org if needed.

### Step 2 — Open the project

```bash
# Clone or unzip the project, then:
cd bikiniscript
code .           # opens the folder in VS Code
```

### Step 3 — Install recommended extensions

VS Code will show a popup: **"Do you want to install the recommended extensions?"**
Click **Install** to get:
- **Code Runner** — run any file with one click
- **Material Icon Theme** — nicer file icons

### Step 4 — Run your first program

**Option A — Use the Run menu (F5):**
1. Open `examples/fizzbuzz.bs`
2. Press `F5` (or go to **Run → Start Debugging**)
3. Select **"▶ Run Current .bs File"** from the dropdown
4. See output in the integrated terminal

**Option B — Use the terminal directly:**
```bash
node bin/bikiniscript.js examples/fizzbuzz.bs
```

**Option C — Use npm scripts:**
```bash
npm run fizzbuzz    # FizzBuzz
npm run hello       # Hello World
npm run krusty      # Class example
npm run fibonacci   # Recursion
npm run repl        # Interactive REPL
```

---

## 🌊 The Language

### Variables — `krabby`

```
krabby name    = "SpongeBob"
krabby patties = 100
krabby hungry  = aye
krabby nothing = plankton
```

### Functions — `spatula`

```
spatula greet(name) {
  give back "Ahoy, " + name + "!"
}

shout(greet("Patrick"))
```

### Conditionals — `aye aye` / `nay nay`

```
aye aye (patties > 0) {
  shout("Order up!")
} nay nay aye aye (patties == 0) {
  shout("We're out!")
} nay nay {
  shout("Something's wrong...")
}
```

### Loops — `jellyfishing`

```
jellyfishing (krabby i = 1; i <= 5; i++) {
  shout("Patty #" + i)
}
```

### Classes — `crusty`

```
crusty Bikini {
  spatula new(name) {
    self.name  = name
    self.items = NetBag[]
  }
  spatula add(item) {
    self.items.push(item)
  }
  spatula count() {
    give back self.items.length
  }
}

krabby b = crusty Bikini("Bottom")
b.add("Jellyfish")
shout(b.count())   // 1
```

### Data Types

| BikiniScript | Meaning         | Example                  |
|-------------|-----------------|--------------------------|
| `krabby`    | variable        | `krabby x = 42`          |
| `aye`       | true            | `krabby flag = aye`      |
| `nay`       | false           | `krabby done = nay`      |
| `plankton`  | null            | `krabby val = plankton`  |
| `NetBag[]`  | array           | `krabby arr = NetBag[]`  |
| `give back` | return          | `give back x + 1`        |

### Built-in Functions

| Function      | Description                      |
|---------------|----------------------------------|
| `shout(x)`    | Print to the terminal            |
| `mathFloor(n)`| Floor of a number                |
| `mathRound(n)`| Round a number                   |
| `mathAbs(n)`  | Absolute value                   |
| `mathSqrt(n)` | Square root                      |
| `mathRandom()`| Random float 0–1                 |
| `mathMax(a,b)`| Maximum of values                |
| `mathMin(a,b)`| Minimum of values                |
| `toNumber(x)` | Convert to number                |
| `toString(x)` | Convert to string                |
| `isNumber(x)` | Type check                       |
| `isString(x)` | Type check                       |
| `isNetBag(x)` | Type check                       |

### Array (NetBag) Methods

```
krabby bag = NetBag[]
bag.push("Krabby Patty")
bag.push("Kelp Shake")
shout(bag.length)          // 2
shout(bag[0])              // Krabby Patty
shout(bag.indexOf("Kelp Shake"))  // 1
shout(bag.join(", "))      // Krabby Patty, Kelp Shake
bag.pop()
```

### String Methods

```
krabby s = "hello bikini"
shout(s.toUpperCase())     // HELLO BIKINI
shout(s.includes("bikini")) // aye
shout(s.split(" "))        // [hello, bikini]
shout(s.length)            // 12
```

---

## 🐚 Interactive REPL

```bash
npm run repl
# or
node bin/bikiniscript.js
```

```
  🧽  BikiniScript v1.0.0 — Interactive REPL
  🌊  Type BikiniScript code and press Enter.

🌊 > krabby x = 42
🌊 > shout(x * 2)
84
🌊 > .help
🌊 > .exit
```

---

## 🔧 Debugging

- **BS_DEBUG=1** — prints full stack traces on errors:

```bash
BS_DEBUG=1 node bin/bikiniscript.js examples/fizzbuzz.bs
```

- In VS Code, use the **"🔍 Debug Interpreter"** launch config to step through
  the **interpreter** itself in the Node.js debugger.

---

## 🗺️ How It Works (Pipeline)

```
  Source (.bs file)
       │
       ▼
  ┌──────────┐
  │  Lexer   │  src/lexer.js  — splits text into tokens
  └──────────┘  e.g. "krabby x = 1" → [KRABBY][IDENTIFIER x][ASSIGN][NUMBER 1]
       │
       ▼
  ┌──────────┐
  │  Parser  │  src/parser.js — builds an Abstract Syntax Tree (AST)
  └──────────┘  e.g. VarDecl { name:"x", init: Literal{1} }
       │
       ▼
  ┌─────────────┐
  │ Interpreter │  src/interpreter.js — walks the AST and executes it
  └─────────────┘
       │
       ▼
    Output
```

---

## 💡 Next Steps to Extend the Language

| Feature            | Where to add it                                      |
|--------------------|------------------------------------------------------|
| `uh oh / catch`    | `parser.js` → new `tryCatchStmt()`, `interpreter.js`|
| `tide await`       | Add async support to `BikiniFunction.call()`         |
| `reel in` imports  | `interpreter.js` → load + run another `.bs` file     |
| `fishnet` matching | `parser.js` → new `matchExpr()`, like a switch       |
| Standard library   | Add more built-ins in `interpreter._registerBuiltins`|
| Syntax highlighting| Create a VS Code extension with a `.tmLanguage` file |
