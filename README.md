# mason-parser

> Markdown Structured Object Notation (MaSON) — A human-centric serialization format bridging natural markdown visual hierarchy and structured JSON.
> Read the official IETF Internet-Draft specification: draft-lee-mason-00.txt
[![License](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![NPM Version](https://img.shields.io/npm/v/mason-parser.svg)](https://www.npmjs.com/package/mason-parser)

MaSON is a lightweight serialization format designed for **human-authored hierarchical documents**, **application configurations**, and **clean context-sharing for Large Language Models (LLMs)**. It replaces structural punctuation (such as curly braces, brackets, and redundant double-quoted keys) with natural Markdown headings and bulleted lists.

---

## 🎯 What Problem Does MaSON Solve?

MaSON fits a specific niche: **human-authored hierarchical documents where visual readability and writeability are more important than representing every complex or strict academic data type.**

### How it Compares:
* **Why not JSON?** JSON is a fantastic machine-to-machine format but is tedious for humans to author or edit. Forgetting a trailing comma, double quote, or bracket results in immediate syntax errors. MaSON allows writing hierarchy naturally.
* **Why not YAML?** YAML is powerful, but its specification is substantially more complex than MaSON's. Its indentation-sensitive syntax can also lead to subtle formatting errors when editing by hand. MaSON uses standard Markdown headings to nest structures safely.
* **Why not TOML?** TOML is highly readable for flat structures, but its readability degrades rapidly when representing deeply nested hierarchies (requiring verbose table brackets like `[servers.database.credentials]`). MaSON utilizes standard Markdown heading depths (`#`, `##`, `###`) to establish nesting levels.

---

## 🎨 Design Philosophy

### Design Goals
- **Easy to read in plain text:** Looks like regular Markdown documentation.
- **Easy to author manually:** No strict whitespace parsing, bracket-matching, or comma rules.
- **Easy to parse:** Extremely small parser footprint (under 2KB gzipped) with a small, maintainable grammar.
- **Deterministic & Round-trip Safe:** Standard structures parse and stringify back-and-forth cleanly.

### Non-Goals
- **Full YAML/JSON feature-parity:** No support for advanced data types or custom type tagging.
- **Anchors, aliases, or references:** No complex object graphs or internal links.
- **YAML-style indentation rules:** No complex multi-space layout rules. MaSON prefers simple explicit visual suffixes (`[]`) or top-level annotations over indentation-sensitive arrays.

---

## 🚀 Key Advantages

- **Zero-Bracket Nesting:** Structure child objects implicitly via standard Markdown headings (`#`, `##`, `###`).
- **Natural Array Triggers:** Bulleted lists (`*`, `-`, `+`) automatically morph parent containers into ordered arrays.
- **Implicit Type Inference:** Native detection of numbers, floats, booleans (`true`/`false`), and `null` values without tedious string conversions.
- **Grounded Token Efficiency:** In nested configuration files and content-rich documents, MaSON can reduce raw characters compared to equivalent JSON by eliminating repeated brackets, braces, and quotation marks. A dedicated **Compact Mode** further maximizes efficiency for LLM pipelines by stripping unnecessary whitespace and condensing array structures into compact tuples, significantly reducing token overhead.
- **Bi-directional Integrity:** Safely stringifies standard JavaScript objects back to MaSON, complete with sorted parameters and clean spacing.

---

## 📦 Installation

```bash
npm install mason-parser
```

---

## 🛠️ Usage Example

### 1. Write an `.mson` File
```markdown
title: Server Setup
version: 1.0.3
debugMode: false
maxRetries: 5

# Servers
* https://api.prod.coolapp.com
* https://api.backup.coolapp.com

# Database
driver: postgres

## Credentials
user: admin
host: localhost

## Backups
* BackupNode1
* BackupNode2
```

### 2. Parse MaSON into JSON
```typescript
import { parse } from 'mason-parser';
import fs from 'fs';

const msonText = fs.readFileSync('config.mson', 'utf-8');
const data = parse(msonText);

console.log(data);
/*
{
  title: "Server Setup",
  version: "1.0.3",
  debugMode: false,
  maxRetries: 5,
  Servers: [
    "https://api.prod.coolapp.com",
    "https://api.backup.coolapp.com"
  ],
  Database: {
    driver: "postgres",
    Credentials: {
      user: "admin",
      host: "localhost"
    },
    Backups: [
      "BackupNode1",
      "BackupNode2"
    ]
  }
}
*/
```

### 3. Stringify back to MaSON (Clean & Compact Modes)

MaSON's stringifier allows you to convert standard JSON objects back into MaSON markdown format. It supports two formatting modes:
* **Clean Mode (`{ compact: false }`)**: Optimized for human readability, inserting blank lines between properties and collections, and maintaining explicit property keys for array elements.
* **Compact Mode (`{ compact: true }`)**: Minimizes token usage for LLM pipelines, stripping empty lines, spacing, and collapsing array-of-objects into dense tuple structures (e.g. `# users[name,age]`).

```typescript
import { stringify } from 'mason-parser';

const config = {
  appName: "TestApp",
  active: true,
  nodes: [101, 102],
  users: [
    { name: "Alice", age: 30 },
    { name: "Bob", age: 25 }
  ]
};

// 1. Clean Mode (Default for readability)
const cleanMson = stringify(config, 0, undefined, { compact: false });
console.log(cleanMson);
/*
appName: TestApp
active: true

# nodes
* 101
* 102

# users[]
## User
name: Alice
age: 30

## User
name: Bob
age: 25
*/

// 2. Compact Mode (Optimized for token-efficiency)
const compactMson = stringify(config, 0, undefined, { compact: true });
console.log(compactMson);
/*
appName:TestApp
active:true
#nodes(101,102)
#users[name,age]
##
Alice
30
##
Bob
25
*/
```

---

## 📜 Grammar & Formatting Rules

At a high level, a MaSON document is parsed line-by-line using a small, deterministic grammar.

```text
Document
 ├── Line (Comment / Empty)    -> Ignored
 ├── Line (Top-Level Array: []) -> Initializes the document as an anonymous Array
 ├── Line (Heading: #+)        -> Opens a nested Object or Object within an Array
 ├── Line (Bullet: *, -, +)    -> Pushes a primitive value to an active array
 └── Line (Property: k: v)     -> Sets a property on the active container
```

1. **Parameters:** Represented by `key: value` pairs. The value is implicitly parsed as a primitive (`number`, `boolean`, `null`, or `string`).
2. **Quoting:** To force any numerical sequence or boolean value to remain a string, wrap it in double or single quotes: `zipCode: "16801"`.
3. **Headings:**
   - Any property before the first `#` is declared at the root level.
   - `#` headings denote level 1 object parameters.
   - `##` headings nest themselves inside the active `#` parent object.
   - If there is no active parent at the required depth, headings fall back to root or nearest sibling.
4. **Lists:** Bullet elements (`*`, `-`, `+`) immediately convert the nearest active heading key into an ordered array of typed primitives.
5. **Explicit Array Suffix (`[]`):** To define an array of complex objects, append `[]` to the heading name (e.g., `# Users[]`). Any nested heading under it (e.g. `## User` or `##`) pushes a new object into that array.
6. **Top-Level Anonymous Arrays:** To make the entire document parse as a top-level array, define `[]` on the very first non-empty line of the file. Each subsequent item header (like `##`) directly pushes a new anonymous object into this array.
7. **Anonymous & Descriptive Heading Labels:** When defining elements of an array (explicit or top-level), heading names are fully optional. You can use empty heading lines (e.g., `## ` or `##`) or descriptive notes (e.g., `## Alice (Admin)`) without affecting the structured JSON properties.
8. **Multiline Values:** Wrap any multi-line text block or formatted string in backticks (`` ` ``). The parser will automatically preserve formatting and newlines within the block.
9. **Forced Brackets (`[` and `{`):** For mixed arrays or explicit containment, appending `[` or `{` to a heading forces the parsed container type to be an array or object, respectively, until a matching closing bracket (`]` or `}`) is encountered on a line by itself or at the end of a value. This isolates nested structures within mixed-type sequences.

---

## 🔍 Edge-Case Specification

To ensure predictable behavior, `mason-parser` handles edge cases according to the following rules:

### 1. Duplicate Headings
```markdown
# User
name: Alice

# User
name: Bob
```
* **Behavior:** Overwrites. The second `# User` initializes a fresh object under the `User` key, overwriting the first one. To represent list-like collections, use bullet points under a single heading instead.

### 2. Mixed-Type Arrays
```markdown
# Items
* 1
* true
* hello
```
* **Behavior:** Allowed. Bullets are parsed individually. The parser yields `[1, true, "hello"]`.

### 3. Arrays of Objects
* **Behavior:** MaSON supports arrays of complex objects using the explicit array suffix (`[]`) or a top-level array modifier (`[]`). Inside these arrays, heading names can be customized with descriptive labels or left completely empty (anonymous objects). For example:
  ```markdown
  # Users[]

  ## Administrator
  name: Alice
  role: admin

  ##
  name: Bob
  role: user
  ```
  This parses directly into an array containing both objects under the key `"Users"`.

### 4. Empty Headings
```markdown
# Settings
```
* **Behavior:** Resolves to `{}`. Encountering a heading immediately instantiates an empty object placeholder in the parent node.

### 5. Backtick Delimiters (Matching)
MaSON handles backticks dynamically based on matching the count of opening and closing backticks:
* **Matching Delimiters & Language Tags:** A block or string starts with any count of backticks `N` (e.g. `1` backtick or `3` backticks) and ends with exactly `N` backticks. The surrounding delimiters on both ends are completely stripped.
  * **Language Tag Stripping:** If opening with 3 or more backticks (e.g. ```` ```javascript ````), a single alphanumeric language identifier following the backticks is automatically stripped to enable seamless Markdown copying.
  ```markdown
  script: ```javascript
  function calculateTotal() {}
  ```
  ```
  * **Behavior:** Resolves to `"function calculateTotal() {}"`.
* **Embedding Backticks:** By using `N` backticks as the delimiter, you can easily embed backticks of other lengths (such as code spans of length `1`) without them being treated as delimiters.
  ```markdown
  literalText: `` `code` ``
  ```
  * **Behavior:** Resolves to `"`code`"`.

### 6. Forced Brackets Isolation (Mixed-Type Arrays)
* **Behavior:** When writing highly nested structures inside mixed arrays, MaSON supports forced bracket suffixes (`[` for array, `{` for object) on headings to cleanly isolate them from other list elements.
  ```markdown
  # MixedDataset
  ## PayloadMixedList[]
  ### InnerArrayForcedBrackets[
  x: 1
  y: 2
  z: 33]

  ### InnerObjectForcedBrackets{
  x: 1
  y: 2
  z: 33}
  * 42
  * "100"
  ```
* **No Forced Brackets on JSON Stringification:** When parsing/converting from JSON back to MaSON via `stringify`, **forced brackets are never introduced**. The stringifier automatically reorders and groups array elements so that primitive/scalar types are written as simple bullet points first, and complex objects/arrays are placed last and serialized under clean heading syntax (`#` or `#[]`). This keeps the serialized MaSON files perfectly clean, standard, and easy to read without any visual bracket pollution.

---

## ⚖️ License

Licensed under the [Apache-2.0 License](LICENSE).
