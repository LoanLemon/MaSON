%%%
title = "Markdown Structured Object Notation (MaSON)"
abbrev = "MaSON"
docName = "draft-lee-mason-00"
category = "std"
ipr = "trust200902"
area = "Applications"
kw = ["serialization", "json", "markdown", "llm", "token"]
date = 2026-06-28

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
This document defines MaSON (Markdown Structured Object Notation), a lightweight data serialization format that maps standard Markdown syntax trees into structured key-value objects. MaSON is designed to maximize human readability and LLM token efficiency by eliminating bracket-based nesting and strict indentation rules.

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
* **Deterministic Bidirectional Equivalence:** MaSON must support deterministic round-tripping. Serializing an active JSON object structure into MaSON text and immediately parsing it back into memory MUST yield an identical object topology.

# Syntax Specification {#syntax}

## Document Structure, Encoding, and Comments
MaSON documents MUST be encoded using UTF-8. Line endings MUST be represented by a single Carriage Return and Line Feed (CRLF) sequence or a single Line Feed (LF) character. The parser MUST normalize line endings to a single uniform delimiter prior to processing.

The formal grammar rules specified via ABNF in Section {{formal-grammar}} describe the format's lexical structure using 8-bit octets. When parsing multi-byte sequences representing valid UTF-8 encoded Unicode scalar values outside the standard ASCII range, the parser MUST treat any continuous block of non-ASCII multibyte octets as a valid literal character sequence within a header key or property value stream.

Lines where the first non-whitespace character consists of a double forward-slash sequence ("//") MUST be treated as comment streams. Parsers MUST ignore comments and blank whitespace lines during lexical token processing.

## Structural Hierarchy and Headers
Object nesting depth and scope are defined structurally by Markdown heading tokens. 

The document root represents an implicit top-level associative array (object). A heading line beginning with one or more '#' characters followed by exactly one space character (0x20) MUST introduce a new nested object scope.

The number of '#' characters determines the absolute nesting depth:

* A single '#' denotes a direct child key of the root object.
* Subsequent heading blocks with additional '#' characters (e.g., '##', '###') denote deeply nested child keys under the most recently declared parent object of a higher logical tier (fewer '#' characters).
* A structural transition to a heading with fewer or equal '#' characters MUST cleanly close out all preceding active scopes up to that nesting depth.

## Key-Value Pairs and Escaping
Properties within a structural scope MUST be declared as a single-line key-value pair separated by a colon character (0x3A). 

* Inline property keys MUST precede the colon separator and MUST NOT contain whitespace characters or control flags. 
* Conversely, a header key declared via heading tokens MAY contain internal horizontal whitespace characters, which MUST be preserved by the parser.
* Optional space characters MAY follow the colon separator before the value payload begins.
* Values MUST be treated as strings by default unless they conform to primitive data types defined in Section {{primitives}}.

To permit structural characters inside property values or header keys, the backslash character ("\", 0x5C) MUST act as an escape character. The sequence "\:" explicitly escapes a colon separator, "\#" escapes a header token, and "\\" escapes the backslash itself. Parsers MUST resolve these escape sequences to their literal equivalents during token assembly.

## Lists as Arrays
Sequential lines beginning with an asterisk ('*', 0x2A) or a hyphen ('-', 0x2D) followed by exactly one space character (0x20) MUST be parsed as sequential array items. 

* If a list sequence occurs directly below an object key declaration without an explicit assignment value, the key's value MUST be instantiated as an ordered array containing those list elements.
* List elements containing key-value colon separators SHOULD NOT be treated as objects unless an explicit object array suffix is supplied.

## Explicit Array Suffixes {#array-suffixes}
To prevent structural ambiguity when constructing arrays of complex objects, a header key MAY append an explicit array suffix consisting of opening and closing square brackets ("[]", 0x5B 0x5D).

When an explicit array suffix is encountered:

* The parser MUST treat the declared key name (omitting the "[]" suffix) as an ordered collection array target.
* If an explicit array header contains no nested contents or children, the structure MUST resolve cleanly to an empty array literal ("[]") rather than an unassigned key or object state.
* Immediate child headers encountered beneath an explicit array declaration ('[]') establish element boundaries but do not themselves become object keys in the mapped memory state.
* If an inline key-value property is declared directly beneath an explicit array header without an intervening child sub-header, the parser MUST instantly instantiate an implicit, unnamed object element container inside that array to isolate and store those properties safely.

## Formal Grammar (ABNF) {#formal-grammar}
The syntax of a MaSON document is defined formally using Augmented Backus-Naur Form (ABNF) as specified in RFC 5234 [@!RFC5234]. The ABNF defines the strict lexical token boundaries of a MaSON stream. The semantic construction of hierarchical object depths, structural array appending, and state stack validation based on these tokens MUST be governed exclusively by the processing rules defined in Section {{processing}}.

```abnf
mason-doc      = *(section / kv-pair / array-list / empty-line / comment)

section        = header-marker SP header-key [array-suffix] CRLF
header-marker  = 1*6"#"
array-suffix   = "[]"

kv-pair        = inline-key ":" [SP] value CRLF

inline-key     = 1*(ALPHA / DIGIT / "-" / "_")
header-key     = inline-key *(1*SP inline-key)

value          = *(escaped-char / literal-char / utf8-scalar)
escaped-char   = "\" ( ":" / "#" / "\" )
literal-char   = %x20-5B / %x5D-7E ; Printable ASCII VCHAR and SP, omitting \
utf8-scalar    = %x80-FF ; Raw tracking slice for multi-byte UTF-8 streams

array-list     = 1*(list-marker SP value CRLF)
list-marker    = "*" / "-"

comment        = *SP "//" *(literal-char / utf8-scalar) CRLF
empty-line     = *SP CRLF

number         = ["-"] 1*DIGIT ["." 1*DIGIT]

```

# Processing and Parsing Behavior {#processing}

## Structural Scope Stack Operations

A MaSON parser MUST maintain an internal state stack to keep track of the active structural hierarchy while traversing a document linearly.

* Upon encountering a header with an absolute depth of N (where N is the count of '#' characters), the parser MUST examine the current depth of the state stack.
* If N is exactly equal to the current stack depth plus one, the new object scope MUST be pushed onto the stack as a nested child of the active object.
* If N is less than or equal to the current stack depth, the parser MUST repeatedly pop scopes off the stack until the stack depth equals N minus one, at which point the new object scope is instantiated and pushed.

## Primitive Value Coercion Rules {#primitives}

Values extracted from key-value properties or array lists MUST be evaluated against literal structural patterns to determine if they undergo data type coercion:

* **Null Coercion:** The exact character sequence "null" (case-sensitive, matching ASCII 0x6E 0x75 0x6C 0x6C) MUST be coerced to a native null reference.
* **Boolean Coercion:** The exact character sequences "true" or "false" (case-sensitive, matching ASCII 0x74 0x72 0x75 0x65 and 0x66 0x61 0x6C 0x73 0x65) MUST be coerced to their respective native boolean definitions.
* **Numeric Coercion:** Character streams matching the `number` rule defined in Section {{formal-grammar}} MUST be coerced directly to native floating-point or integer numeric signatures within the processing environment. Any token sequence containing characters deviating from that structure MUST NOT undergo numeric coercion and falls back cleanly to a string representation.

## Text and Scope Trimming

Parsers MUST strip leading and trailing horizontal whitespace (spaces 0x20 and horizontal tabs 0x09) from both property keys and property values prior to evaluation or storage. Internal whitespace within a value payload MUST be preserved explicitly.

## Duplicate Member Handling {#duplicate-handling}

If a document contains duplicate inline property keys within the same active object scope, the parser MUST enforce a last-assignment-wins strategy, where the final parsed assignment value overwrites any preceding declaration.

Conversely, if a nested sub-header configuration path matches a path that has been declared previously in the document stream, the parser MUST execute a deep recursive merge of the subsequent properties into the existing structure rather than overwriting or purging the original object hierarchy. If a collision occurs between identical inline scalar keys inside those recursively merged header scopes, the final assignment declaration takes precedence.

# Security Considerations

## Resource Exhaustion and Stack Overflow

Because MaSON determines structural depth and nesting scope by the linear accumulation of heading tokens (the '#' character), naive implementations relying on recursive parsing strategies or unbounded internal state stacks are vulnerable to stack overflow or out-of-memory errors.

An attacker could craft a malicious MaSON document consisting of thousands of deeply nested sequential headers (e.g., repeating incrementing sequences of '#', '##', '###', etc.) or exceptionally long continuous lines of a single token archetype. Implementations MUST enforce an upper limit on maximum nesting depth (a RECOMMENDED default limit of 32 levels) and maximum single-line buffer lengths to guarantee deterministic termination and mitigate Denial of Service (DoS) vectors.

## Type Coercion and Key Injection

As outlined in Section {{syntax}}, parsers are expected to automatically coerce primitive string sequences matching boolean or numeric literal patterns into native equivalents. Implementations MUST validate that incoming token sequences do not trigger prototype pollution or unexpected type mutation behaviors within the execution environment.

Furthermore, because MaSON documents eliminate explicit enclosing string delimiters for property values, applications consuming data from unvetted MaSON inputs MUST validate that payload string values do not inadvertently mirror structural control characters (such as colons or heading markers) that could be re-serialized to inject malicious keys into a downstream application state.

## Embedded Content and Code Block Safety

MaSON implementations handling complex inline values or embedded code blocks MUST treat the underlying isolated content strictly as static string fragments. Parsers MUST NOT evaluate or execute code blocks embedded within a document stream. Applications displaying or executing data extracted from a MaSON payload MUST apply contextual sanitization to prevent downstream Cross-Site Scripting (XSS) or command injection vulnerabilities.

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
Applications that use this media type: General-purpose software systems, system orchestration configuration tooling, and large language model prompt frameworks.

## File Extension Registration

The standard file extensions designated for MaSON structured data documents are ".mason" and ".mson".

# References

## Normative References

## Informative References

# Structural Mapping Examples

## Standard Structured Object Configuration

The following sample demonstrates a typical MaSON configuration input containing explicit primitives, lists, and structural scope depth nesting.

```markdown
# Server Setup
debugMode: false
maxRetries: 5

# Servers
* [https://api.prod.coolapp.com](https://api.prod.coolapp.com)
* [https://api.backup.coolapp.com](https://api.backup.coolapp.com)

# Database
driver: postgres

## Credentials
user: admin
host: localhost

```

An RFC-compliant MaSON parser tracking the stack shifts and types outlined in this specification MUST map the source text above directly into the following equivalent JSON structure:

```json
{
  "Server Setup": {
    "debugMode": false,
    "maxRetries": 5
  },
  "Servers": [
    "[https://api.prod.coolapp.com](https://api.prod.coolapp.com)",
    "[https://api.backup.coolapp.com](https://api.backup.coolapp.com)"
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

The following sample illustrates the normative handling of nested object collections within sequential, recurring header declarations. Immediate sub-headers beneath an explicit array declaration ('[]') act as element boundary markers, instantiating a new object item within the collection array.

```markdown
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

An RFC-compliant MaSON parser tracking the active `[]` array scope stack MUST generate the following structure:

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

## Implicit Object Instantiation within Array Scopes

The following sample illustrates the parsing response when an inline key-value property sequence is introduced directly below an explicit object array header without intermediate element boundary sub-headers, mapping to the behavior defined in Section {{array-suffixes}}.

```markdown
# Users[]
name: Alice
age: 20

```

```json
[
  {
    "name": "Alice",
    "age": 20
  }
]

```

## Recursive Deep Merging of Duplicate Headers

The following sample demonstrates how consecutive occurrences of a shared header identity path deeply combine nested property structures recursively based on the rules in Section {{duplicate-handling}}.

```markdown
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

# Technical Design Rationale

The design decisions governing the assembly of MaSON are structured to address specific historical limitations encountered in standard data serialization languages:

* **Headings vs Indentation:** Standard indentation-based layouts (such as YAML) frequently create parsing vulnerabilities across distributed application boundaries due to non-visible structural spacing variants or text translation wrapping. By shifting dependency strictly to explicit, character-anchored heading tokens (The '#' element), MaSON decouples hierarchy entirely from spatial indent levels.
* **Explicit [] Suffixing:** While implicit layout scanning can determine list boundaries for primitive sequences, arrays tracking complex structures with dynamic nesting depths introduce deep tracking ambiguity. Enforcing an explicit "[]" suffix ensures that any multi-language compiler instantly knows the type-class of the upcoming frame tree without relying on heavy schema lookaheads.
* **Omission of Closing Enclosures:** Braces, brackets, and closing lines are heavily utilized by machines to clear stack frames but represent significant token redundancy when processed by text-transformer algorithms. MaSON shifts the responsibility of stack scope tracking from closing symbols to progressive line state shifts. In the benchmark corpus described in Appendix B, this strategy reduced token counts by approximately 46.5% compared to conventional JSON structures.
