%%%
title = "Markdown Structured Object Notation (MaSON)"
abbrev = "MaSON"
docName = "draft-lee-mason-01"
category = "std"
ipr = "trust200902"
area = "Applications"
workgroup = "Independent Submission"
kw = ["serialization", "json", "markdown", "llm", "token", "compact"]
date = 2026-06-28

[seriesInfo]
name = "Internet-Draft"
value = "draft-lee-mason-01"
stream = "IETF"
status = "standard"

[[author]]
initials = "DL"
surname = "Lee"
fullname = "Dustin Lee"
organization = "Independent"
[author.address]
email = "dlee@lemone.online"
uri = "https://github.com/LoanLemon/MaSON"
%%%

.# Abstract
This document defines MaSON (Markdown Structured Object Notation), a lightweight data serialization format that maps standard Markdown syntax trees into structured key-value objects. MaSON is designed to maximize human readability and LLM token efficiency by eliminating bracket-based nesting and strict indentation rules. This updated specification introduces "Compact Mode" optimized for extreme token density, support for multi-line string encapsulation, and mixed-type array isolation via forced brackets.

{mainmatter}

# Introduction
Data serialization formats play a critical role in configuration, distributed systems, and application state management. Traditional formats such as JSON (RFC 8259) offer deterministic parsing but present syntax overhead (e.g., explicit braces, quotation marks, and strict trailing comma rules) that impairs manual, human-authored editing. Alternative human-readable formats, notably YAML, resolve bracket verbosity but introduce structural fragility through strict multi-space indentation constraints.

Concurrently, the rise of Large Language Models (LLMs) has introduced a new serialization constraint: token optimization. Repetitive structural characters in JSON and YAML consume valuable context window resources when data structures are injected into generative AI system prompts.

This document defines MaSON (Markdown Structured Object Notation), a format designed to bridge human readability, machine parsing efficiency, and token density. MaSON repurposes ubiquitous Markdown (RFC 7763) layout paradigms—specifically headers and list delimiters—to establish object hierarchies without syntax-heavy nesting markers.

## Requirements Language
The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in BCP 14 [@!RFC2119] [@!RFC8174] when, and only when, they appear in all capitals, as shown here.

## Semantic Reinterpretation of Markdown
This specification intentionally assigns structured, machine-readable data serialization semantics to Markdown heading syntax beyond the purely presentational or structural document behaviors defined in RFC 7763. While a MaSON document remains syntactically valid Markdown, its document tree is explicitly mapped to associative data structures rather than an HTML visual layout.

# Architectural Goals and Core Paradigms
The design of MaSON is governed by the following core architectural principles:

* **Visual Ubiquity:** The serialization layout MUST closely mimic standard human-readable Markdown documentation. A non-technical user should be capable of modifying a MaSON configuration file using a basic text editor without violating language grammar rules.
* **Indentation Independence:** To prevent layout-based parsing errors common in formats like YAML, MaSON schemas MUST NOT rely on white-space or multi-space indentation depth to determine object or array scope boundaries.
* **Token Efficiency:** By removing structural punctuation, quotes, and structural padding, MaSON text structures seek to minimize the character-to-data footprint relative to equivalent JSON payloads, optimizing it for text-based LLM processing and prompt engineering workflows.
* **Deterministic Bidirectional Equivalence:** MaSON must support deterministic round-tripping. Serializing an active JSON object structure into MaSON text and immediately parsing it back into memory MUST yield an identical object topology, with specific handling for visual purity upon re-serialization.

# Syntax Specification {#syntax}

## Document Structure, Encoding, and Comments
MaSON documents MUST be encoded using UTF-8. Line endings MUST be represented by a single Carriage Return and Line Feed (CRLF) sequence or a single Line Feed (LF) character. The parser MUST normalize line endings to a single uniform delimiter prior to processing.

The formal grammar rules specified via EBNF in Section {{formal-grammar}} describe the format's lexical structure. When parsing multi-byte sequences representing valid UTF-8 encoded Unicode scalar values outside the standard ASCII range, the parser MUST treat any continuous block of non-ASCII multibyte octets as a valid literal character sequence.

Lines where the first non-whitespace character consists of a double forward-slash sequence (`//`) or standard HTML comment blocks (``) MUST be treated as comment streams. Parsers MUST ignore comments and blank whitespace lines during lexical token processing.

To initialize the entire document as a top-level anonymous array rather than a root object, a bracketed token (e.g., `[]` or a property map like `[id, name]`) MAY be defined on the very first non-empty line of the file.

## Structural Hierarchy and Headers
Object nesting depth and scope are defined structurally by Markdown heading tokens. 

The document root represents an implicit top-level associative array (object) unless overridden by a top-level array token. A heading line beginning with one or more `#` characters followed by exactly one space character (0x20) MUST introduce a new nested object scope.

The number of `#` characters determines the absolute nesting depth:

* A single `#` denotes a direct child key of the root object.
* Subsequent heading blocks with additional `#` characters (e.g., `##`, `###`) denote deeply nested child keys under the most recently declared parent object of a higher logical tier (fewer `#` characters).
* A structural transition to a heading with fewer or equal `#` characters MUST cleanly close out all preceding active scopes up to that nesting depth.
* Heading names are fully optional when defining elements of an array. Empty heading lines (e.g., `## `) or descriptive notes (e.g., `## Alice (Admin)`) do not affect the structured JSON properties.

## Key-Value Pairs, Multiline Values, and Escaping
Properties within a structural scope MUST be declared as a single-line key-value pair separated by a colon character (0x3A). 

* Inline property keys MUST precede the colon separator and MUST NOT contain whitespace characters or control flags. 
* Conversely, a header key declared via heading tokens MAY contain internal horizontal whitespace characters, which MUST be preserved by the parser.
* Optional space characters MAY follow the colon separator before the value payload begins.
* Values MUST be treated as strings by default unless they conform to primitive data types defined in Section {{primitives}}.

**Multiline Values:** To support multi-line string blocks or formatted text, MaSON dynamically matches backtick delimiters (`` ` ``).
* A block or string starts with any count of backticks *N* and ends with exactly *N* backticks. The surrounding delimiters on both ends MUST be stripped.
* If opening with 3 or more backticks (e.g., ```` ```javascript ````), a single alphanumeric language identifier following the backticks MUST be automatically parsed and stripped by the parser.

**Escaping:** To permit structural characters inside property values or header keys, the backslash character (`\`, 0x5C) MUST act as an escape character. The sequence `\:` explicitly escapes a colon separator, `\#` escapes a header token, and `\\` escapes the backslash itself.

## Lists as Arrays
Sequential lines beginning with an asterisk (`*`, 0x2A), hyphen (`-`, 0x2D), or plus (`+`, 0x2B) followed by exactly one space character (0x20) MUST be parsed as sequential array items. 

* If a bullet is parsed under an active heading, and the active heading is currently an empty object (`{}`), its container type MUST be morphed to an ordered array (`[]`).
* If the container already has property keys, the bullet value MUST be pushed into an implicit `_items` key in that object to protect properties from silent deletion.

## Array Suffixes, Compact Arrays, and Forced Brackets {#array-suffixes}

### Explicit Array Suffixes
To prevent structural ambiguity when constructing arrays of complex objects, a header key MAY append an explicit array suffix consisting of opening and closing square brackets (`[]`, 0x5B 0x5D). Immediate child headers encountered beneath an explicit array declaration establish element boundaries but do not themselves become object keys in the mapped memory state.

### Compact Arrays and Property Maps
To minimize token overhead for repetitive structures, inline arrays and property mappings MAY be declared directly on headings:
* **Primitive Lists:** A heading ending in `(val1, val2)` pushes those primitive values into the array.
* **Property Maps:** A heading ending in `[key1, key2]` (with or without `()`) maps subsequent nested child entries as objects with those positional keys, skipping the need to repeat keys for each array item.
* **Top-Level Maps:** The top-level document array can begin with a property map (e.g., `[key1, key2]`) on the first line to apply the mapping to all root array entries.

### Forced Brackets
For mixed-type arrays, appending `[` or `{` to a heading explicitly forces the parsed container type to be an array or object, respectively, until a matching closing bracket (`]` or `}`) is encountered on a line by itself or at the end of a value. This isolates nested structures within mixed-type sequences.

## Formal Grammar (EBNF) {#formal-grammar}
The syntax of a MaSON document is defined formally using Extended Backus-Naur Form (EBNF). The semantic construction of hierarchical object depths and state stack validation based on these tokens MUST be governed exclusively by the processing rules defined in Section {{processing}}.

```ebnf
document             = [ top_level_array | root_properties ] ;

(* Structural Core *)
top_level_array      = "[" , [ property_list ] , "]" , newline , { newline } , [ array_elements ] ;
root_properties      = { property_line | comment_line | newline } , [ heading_hierarchy ] ;

heading_hierarchy    = heading_line , { heading_content | heading_hierarchy } ;
heading_content      = property_line | array_bullet_line | comment_line | newline ;

(* Line Types *)
heading_line         = spaces , hash_sequence , spaces , heading_label , newline ;
property_line        = spaces , key , spaces , ":" , spaces , value , newline ;
array_bullet_line    = spaces , bullet_char , spaces , value , newline ;
comment_line         = spaces , "" , newline ;

(* Tokens and Identifiers *)
hash_sequence        = "#" , { "#" } ;
bullet_char          = "*" | "-" | "+" ;
spaces               = { " " | "\t" } ;
newline              = "\r\n" | "\n" ;

heading_label        = [ explicit_array_label | forced_array_label | forced_object_label | compact_array_label | literal_label ] ;
explicit_array_label = literal_label , "[]" ;
forced_array_label   = literal_label , "[" ;
forced_object_label  = literal_label , "{" ;
compact_array_label  = literal_label , [ "(" , primitive_list , ")" ] , [ "[" , property_list , "]" ] ;
primitive_list       = primitive_value , { "," , primitive_value } ;
property_list        = key , { "," , key } ;
literal_label        = { any_character_except_brackets_or_hash } ;

key                  = { any_character_except_colon_or_spaces } ;
value                = multiline_value | primitive_value ;

(* Values & Types *)
multiline_value      = backticks , [ language_tag ] , newline , multiline_text , backticks ;
backticks            = "`" , { "`" } ;
language_tag         = { letter } ;
multiline_text       = { any_character } ;

primitive_value      = boolean_literal | null_literal | number_literal | string_literal ;
boolean_literal      = "true" | "false" ;
null_literal         = "null" ;
number_literal       = [ "+" | "-" ] , digit , { digit } , [ "." , { digit } ] , [ ( "e" | "E" ) , [ "+" | "-" ] , { digit } ] ;
string_literal       = quoted_string | unquoted_string ;

quoted_string        = ( '"' , { escaped_char | any_char_except_double_quote } , '"' )
                     | ( "'" , { escaped_char | any_char_except_single_quote } , "'" ) ;
escaped_char         = "\\" , ( '"' | "'" | "`" | "\\" ) ;
unquoted_string      = { any_character_except_newline_and_trailing_spaces } ;

```

# Processing, Stringification, and Behavior {#processing}

## Structural Scope Stack Operations

A MaSON parser MUST maintain an internal state stack to keep track of the active structural hierarchy while traversing a document linearly.

* Upon encountering a header with an absolute depth of N (where N is the count of `#` characters), the parser MUST examine the current depth of the state stack.
* If N is exactly equal to the current stack depth plus one, the new object scope MUST be pushed onto the stack as a nested child of the active object.
* If N is less than or equal to the current stack depth, the parser MUST repeatedly pop scopes off the stack until the stack depth equals N minus one, at which point the new object scope is instantiated and pushed.

## Primitive Value Coercion Rules {#primitives}

Values extracted from key-value properties or array lists MUST be evaluated against literal structural patterns to determine if they undergo data type coercion:

* **Null Coercion:** The exact character sequence "null" (case-sensitive) MUST be coerced to a native null reference.
* **Boolean Coercion:** The exact character sequences "true" or "false" (case-sensitive) MUST be coerced to their respective native boolean definitions.
* **Numeric Coercion:** Character streams matching the `number` rule defined in Section {{formal-grammar}} MUST be coerced directly to native floating-point or integer numeric signatures. Any token sequence containing characters deviating from that structure MUST NOT undergo numeric coercion and falls back cleanly to a string representation.
* **String Quoting:** To force any numerical sequence or boolean value to remain a string, it MUST be wrapped in double or single quotes (e.g., `zipCode: "16801"`).

## Text and Scope Trimming

Parsers MUST strip leading and trailing horizontal whitespace from both property keys and property values prior to evaluation or storage. Internal whitespace within a value payload MUST be preserved explicitly.

## Duplicate Member Handling {#duplicate-handling}

If a document contains duplicate inline property keys within the same active object scope, the parser MUST enforce a last-assignment-wins strategy.

Conversely, if a nested sub-header configuration path matches a path that has been declared previously in the document stream, the parser MUST execute a deep recursive merge of the subsequent properties into the existing structure rather than overwriting or purging the original object hierarchy.

## Stringification and Visual Purity

MaSON stringifiers MUST support bi-directional data integrity with two formatting modes:

* **Clean Mode (`compact: false`):** Optimized for human readability, inserting blank lines between properties and collections.
* **Compact Mode (`compact: true`):** Minimizes token usage for LLMs, stripping empty lines and collapsing array-of-objects into dense tuple structures (e.g. `# users[name,age]`).

**No Forced Brackets on JSON Stringification:** When parsing/converting from JSON back to MaSON via stringification, forced brackets (`[` or `{`) MUST NOT be introduced. The stringifier MUST automatically reorder array elements so that primitive/scalar types are written as simple bullet points first, and complex objects/arrays are placed last and serialized under clean heading syntax (`#` or `#[]`).

# Security Considerations

## Resource Exhaustion and Stack Overflow

Because MaSON determines structural depth and nesting scope by the linear accumulation of heading tokens, naive implementations relying on recursive parsing strategies or unbounded internal state stacks are vulnerable to stack overflow or out-of-memory errors. Implementations MUST enforce an upper limit on maximum nesting depth (a RECOMMENDED default limit of 32 levels) to guarantee deterministic termination.

## Type Coercion and Key Injection

Parsers are expected to automatically coerce primitive string sequences. Implementations MUST validate that incoming token sequences do not trigger prototype pollution or unexpected type mutation behaviors within the execution environment.

## Embedded Content and Code Block Safety

MaSON implementations handling complex multiline inline values or embedded code blocks MUST treat the underlying isolated content strictly as static string fragments. Parsers MUST NOT evaluate or execute code blocks embedded within a document stream. Applications displaying data extracted from a MaSON payload MUST apply contextual sanitization to prevent downstream Cross-Site Scripting (XSS) or command injection vulnerabilities.

# IANA Considerations

This document requests the registration of a new media type and file extension in accordance with the procedures defined in RFC 6838 [@!RFC6838].

## Media Type Registration: application/mason

Type name: application
Subtype name: mason
Required parameters: None
Optional parameters: charset (The value MUST be "utf-8")
Encoding considerations: binary (UTF-8 encoded text)
Security considerations: See Section 5 of this document.
Interoperability considerations: MaSON is designed for cross-platform data interchange across server, browser, and language-model environments.
Published specification: This document.

## File Extension Registration

The standard file extensions designated for MaSON structured data documents are ".mason" and ".mson".

{backmatter}

# References

## Normative References

## Informative References

# Structural Mapping Examples

## Standard Structured Object Configuration

```mason
# Server Setup
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

```

```json
{
  "Server Setup": {
    "debugMode": false,
    "maxRetries": 5
  },
  "Servers": [
    "https://api.prod.coolapp.com",
    "https://api.backup.coolapp.com"
  ],
  "Database": {
    "driver": "postgres",
    "Credentials": {
      "user": "admin",
      "host": "localhost"
    }
  }
}

```

## Arrays of Complex Objects via Suffix Syntax

```mason
# Cluster Infrastructure
environment: production

## Nodes[]

### Node Item
host: compute-01.local
capacity: 64

### Node Item
host: compute-02.local
capacity: 128

```

```json
{
  "Cluster Infrastructure": {
    "environment": "production",
    "Nodes": [
      {
        "host": "compute-01.local",
        "capacity": 64
      },
      {
        "host": "compute-02.local",
        "capacity": 128
      }
    ]
  }
}

```

## Multiline String Blocks with Language Tags

```mason
# Documentation
readme: ```markdown
Welcome to the project!
Use `npm run dev` to start.

```

```

```json
{
  "Documentation": {
    "readme": "Welcome to the project!\nUse `npm run dev` to start."
  }
}

```

## Compact Mode Arrays

```mason
# MixedDataset
## PayloadMixedList(42, "100", false, null, 2026-06-27)[x, y, z]
###
1
2
33

```

```json
{
  "MixedDataset": {
    "PayloadMixedList": [
      42,
      "100",
      false,
      null,
      "2026-06-27",
      {
        "x": 1,
        "y": 2,
        "z": 33
      }
    ]
  }
}

```

## Forced Brackets Isolation (Mixed-Type Arrays)

```mason
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

```json
{
  "MixedDataset": {
    "PayloadMixedList": [
      [
        {"x": 1},
        {"y": 2},
        {"z": 33}
      ],
      {
        "x": 1,
        "y": 2,
        "z": 33
      },
      42,
      "100"
    ]
  }
}

```

## Recursive Deep Merging of Duplicate Headers

```mason
# Target Object
## Nested Child
initial_key: true

# Target Object
## Nested Child
appended_key: false

```

```json
{
  "Target Object": {
    "Nested Child": {
      "initial_key": true,
      "appended_key": false
    }
  }
}

```

# Complex Edge Case and Tokenization Reference

## Token and Character Density Methodology and Comparison

The structural efficiency metrics detailed below were generated empirically by processing a single, logically identical Agent Configuration payload compiled across formats and evaluated using OpenAI's production "cl100k_base" tokenization algorithm. The benchmark results are illustrative rather than normative.

| Format | Characters | Tokens (GPT-4) | Overhead Reduction |
| --- | --- | --- | --- |
| JSON | 194 | 58 | Baseline |
| YAML | 132 | 44 | 24.1% |
| MaSON | 98 | 31 | 46.5% |

In this specific benchmark, MaSON reduced token count by approximately 46.5% relative to the JSON baseline.

## Edge Case Matrix

| Input Payload (MaSON) | Resulting Memory State (JSON) |
| --- | --- |
| `key: null` | `{ "key": null }` |
| `msg: err\: failed` | `{ "msg": "err: failed" }` |
| `hex: #ff0000` | `{ "hex": "#ff0000" }` |
| `# Empty Array[]` | `[]` |
| `script: ```` ```javascript` | Strips language identifier `javascript` |

# Technical Design Rationale

The design decisions governing the assembly of MaSON are structured to address specific historical limitations encountered in standard data serialization languages:

* **Headings vs Indentation:** Standard indentation-based layouts (such as YAML) frequently create parsing vulnerabilities across distributed application boundaries due to non-visible structural spacing variants or text translation wrapping. By shifting dependency strictly to explicit, character-anchored heading tokens (The `#` element), MaSON decouples hierarchy entirely from spatial indent levels.
* **Explicit [] Suffixing:** While implicit layout scanning can determine list boundaries for primitive sequences, arrays tracking complex structures with dynamic nesting depths introduce deep tracking ambiguity. Enforcing an explicit `[]` suffix ensures that any multi-language compiler instantly knows the type-class of the upcoming frame tree without relying on heavy schema lookaheads.
* **Omission of Closing Enclosures:** Braces, brackets, and closing lines are heavily utilized by machines to clear stack frames but represent significant token redundancy when processed by text-transformer algorithms. MaSON shifts the responsibility of stack scope tracking from closing symbols to progressive line state shifts. In the benchmark corpus described in Appendix B, this strategy reduced token counts by approximately 46.5% compared to conventional JSON structures.