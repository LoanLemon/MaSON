/**
 * MSON (Markdown Structured Object Notation) Parser & Stringifier
 * A lightweight, high-performance serialization format that bridges natural markdown and structured JSON.
 */

export interface ParserTraceStep {
  lineNumber: number;
  lineText: string;
  action: string;
  stackDepth: number;
  currentStack: string[];
  status: 'info' | 'success' | 'warning' | 'error';
}

export interface ParseResult {
  data: any;
  trace: ParserTraceStep[];
  error?: string;
  stats: {
    parseTimeMs: number;
    linesProcessed: number;
    charCount: number;
    estimatedTokens: number;
    jsonCharCount: number;
    jsonEstimatedTokens: number;
    tokenSavingsPercent: number;
  };
}

export interface ParseOptions {
  noTrace?: boolean;
}

// Static precompiled regexes for higher V8 performance
const BACKTICK_REGEX = /`+/g;
const DOUBLE_QUOTE_REGEX = /"/g;
const LANGUAGE_TAG_REGEX = /^[a-zA-Z0-9+#-]+$/;
const NUMBER_REGEX = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * Finds the first colon index that is NOT enclosed in quotes or backticks,
 * respecting escaped backslashes.
 */
function findColonIndex(line: string, start: number): number {
  const len = line.length;
  let inDouble = false;
  let inSingle = false;
  let inBacktick = false;
  
  for (let i = start; i < len; i++) {
    const code = line.charCodeAt(i);
    
    // Handle escape char
    if (code === 92 /* '\\' */) {
      i++; // Skip next char
      continue;
    }
    
    if (code === 34 /* '"' */ && !inSingle && !inBacktick) {
      inDouble = !inDouble;
    } else if (code === 39 /* "'" */ && !inDouble && !inBacktick) {
      inSingle = !inSingle;
    } else if (code === 96 /* '`' */ && !inDouble && !inSingle) {
      inBacktick = !inBacktick;
    } else if (code === 58 /* ':' */ && !inDouble && !inSingle && !inBacktick) {
      return i;
    }
  }
  return -1;
}

/**
 * Casts a string value to its implicit primitive type or returns the string.
 * Strips quotes if they enclose the string explicitly and restores escaped characters.
 */
export function parsePrimitiveValue(val: string): any {
  const len = val.length;
  if (len === 0) return val;

  const first = val.charCodeAt(0);
  const last = val.charCodeAt(len - 1);

  if (len >= 2) {
    if ((first === 34 && last === 34) || (first === 39 && last === 39) || (first === 96 && last === 96)) {
      const content = val.slice(1, -1);
      if (content.indexOf('\\') !== -1) {
        if (first === 34) {
          return content.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        } else if (first === 39) {
          return content.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
        } else if (first === 96) {
          return content.replace(/\\`/g, "`").replace(/\\\\/g, '\\');
        }
      }
      return content;
    }
  }

  if (first === 116 && val === 'true') return true;
  if (first === 102 && val === 'false') return false;
  if (first === 110 && val === 'null') return null;

  // Optimize numeric check: digits, '-' or '.' or '+' using stricter regex
  if ((first >= 48 && first <= 57) || first === 45 || first === 46 || first === 43) {
    if (NUMBER_REGEX.test(val)) {
      const num = Number(val);
      if (!isNaN(num)) {
        return num;
      }
    }
  }

  // Unescape literal \n back to newlines for compact mode strings
  return val.replace(/\\n/g, '\n');
}

/**
 * Parses a single-line or multiline value, advancing the line reader index if needed.
 */
export function parseValueWithMultiline(initialValStr: string, lines: string[], currentLineIndex: number): { value: any, nextLineIndex: number } {
  const valStr = initialValStr;
  let nextLineIndex = currentLineIndex;

  let backtickCount = 0;
  while (backtickCount < valStr.length && valStr.charCodeAt(backtickCount) === 96) {
    backtickCount++;
  }

  if (backtickCount > 0) {
    const termSeq = '`'.repeat(backtickCount);

    if (valStr.endsWith(termSeq) && valStr.length >= backtickCount * 2) {
      let content = valStr.slice(backtickCount, -backtickCount);
      if (backtickCount > 1 && content.startsWith(' ') && content.endsWith(' ') && content.trim() !== '') {
        content = content.slice(1, -1);
      }
      const trimmedVal = content.trim();
      if (trimmedVal === 'true' || trimmedVal === 'false' || trimmedVal === 'null' || (trimmedVal !== '' && !isNaN(Number(trimmedVal)))) {
        return { value: parsePrimitiveValue(trimmedVal), nextLineIndex };
      } else {
        return { value: content, nextLineIndex };
      }
    } else {
      let firstLineContent = valStr.slice(backtickCount).trim();
      if (backtickCount >= 3 && LANGUAGE_TAG_REGEX.test(firstLineContent)) {
        firstLineContent = '';
      }
      let multilineContent = firstLineContent;
      if (multilineContent) {
        multilineContent += '\n';
      }
      let j = currentLineIndex + 1;
      for (; j < lines.length; j++) {
        const nextRawLine = lines[j];
        
        // Find trailing non-whitespace in nextRawLine
        let endIdx = nextRawLine.length - 1;
        while (endIdx >= 0) {
          const code = nextRawLine.charCodeAt(endIdx);
          if (code === 32 || code === 9 || code === 13) {
            endIdx--;
          } else {
            break;
          }
        }
        
        let endsWithTerm = false;
        if (endIdx + 1 >= backtickCount) {
          endsWithTerm = true;
          for (let k = 0; k < backtickCount; k++) {
            if (nextRawLine.charCodeAt(endIdx - k) !== 96 /* '`' */) {
              endsWithTerm = false;
              break;
            }
          }
        }

        if (endsWithTerm) {
          const lastIndex = endIdx - backtickCount + 1;
          const lineContent = nextRawLine.slice(0, lastIndex);
          multilineContent += lineContent;
          nextLineIndex = j;
          break;
        } else {
          multilineContent += nextRawLine + '\n';
        }
      }

      const trimmedVal = multilineContent.trim();
      if (trimmedVal === 'true' || trimmedVal === 'false' || trimmedVal === 'null' || (trimmedVal !== '' && !isNaN(Number(trimmedVal)))) {
        return { value: parsePrimitiveValue(trimmedVal), nextLineIndex };
      } else {
        // Strip a single leading and trailing newline/carriage return if they exist due to formatting
        let cleanStr = multilineContent;
        if (cleanStr.startsWith('\n')) {
          cleanStr = cleanStr.slice(1);
        } else if (cleanStr.startsWith('\r\n')) {
          cleanStr = cleanStr.slice(2);
        }
        if (cleanStr.endsWith('\n')) {
          cleanStr = cleanStr.slice(0, -1);
        }
        if (cleanStr.endsWith('\r')) {
          cleanStr = cleanStr.slice(0, -1);
        }

        // Handle quoted multiline strings (double or single quotes)
        if (
          (cleanStr.startsWith('"') && cleanStr.endsWith('"')) ||
          (cleanStr.startsWith("'") && cleanStr.endsWith("'"))
        ) {
          cleanStr = cleanStr.slice(1, -1);
        }
        return { value: cleanStr, nextLineIndex };
      }
    }
  }

  return { value: parsePrimitiveValue(valStr), nextLineIndex };
}

function splitCompactValues(inside: string): string[] {
  const result: string[] = [];
  let current = '';
  let inBackticks = false;
  let backtickCount = 0;
  
  for (let i = 0; i < inside.length; i++) {
    const char = inside[i];
    
    if (char === '`') {
      let j = i;
      while (j < inside.length && inside[j] === '`') {
        j++;
      }
      const count = j - i;
      
      if (!inBackticks) {
        inBackticks = true;
        backtickCount = count;
      } else if (count === backtickCount) {
        inBackticks = false;
        backtickCount = 0;
      }
      current += inside.substring(i, j);
      i = j - 1;
    } else if (char === ',' && !inBackticks) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current);
  return result;
}

/**
 * Formats a value for MSON stringification.
 * Wraps in quotes if it has special characters or looks like a keyword but is a string.
 */
export function stringifyPrimitiveValue(val: any, options: { compact?: boolean, inCompactArray?: boolean } = {}): string {
  const isCompact = options.compact !== false;
  if (val === null) return 'null';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'number') return String(val);

  let str = String(val);

  if (options.inCompactArray && str.includes(',')) {
    let maxConsecutive = 0;
    let match;
    BACKTICK_REGEX.lastIndex = 0;
    while ((match = BACKTICK_REGEX.exec(str)) !== null) {
      if (match[0].length > maxConsecutive) {
        maxConsecutive = match[0].length;
      }
    }
    const wrapCount = Math.max(1, maxConsecutive + 1);
    const tick = '`'.repeat(wrapCount);
    return `${tick}${str}${tick}`;
  }

  if (str.includes('\n')) {
    if (isCompact) {
      str = str.replace(/\n/g, '\\n');
    } else {
      let maxConsecutive = 0;
      let match;
      BACKTICK_REGEX.lastIndex = 0;
      while ((match = BACKTICK_REGEX.exec(str)) !== null) {
        if (match[0].length > maxConsecutive) {
          maxConsecutive = match[0].length;
        }
      }
      const wrapCount = maxConsecutive + 1;
      const wrapSeq = '`'.repeat(wrapCount);
      return `${wrapSeq}\n${str}\n${wrapSeq}`;
    }
  }

  if (str.includes('`')) {
    let maxConsecutive = 0;
    let match;
    BACKTICK_REGEX.lastIndex = 0;
    while ((match = BACKTICK_REGEX.exec(str)) !== null) {
      if (match[0].length > maxConsecutive) {
        maxConsecutive = match[0].length;
      }
    }
    const wrapCount = maxConsecutive + 1;
    const wrapSeq = '`'.repeat(wrapCount);
    return `${wrapSeq}${str}${wrapSeq}`;
  }

  // If the string starts/ends with spaces, or contains a colon, or could be parsed as another primitive, wrap it
  const needsQuotes = 
    str.trim() !== str || 
    str.includes(':') || 
    str === 'true' || 
    str === 'false' || 
    str === 'null' || 
    (NUMBER_REGEX.test(str) && str !== '');

  if (needsQuotes) {
    return `"${str.replace(DOUBLE_QUOTE_REGEX, '\\"')}"`;
  }
  return str;
}

/**
 * Parses MSON text into a JavaScript Object / Array.
 */
export function parse(text: string, options?: ParseOptions): any {
  return parseWithTrace(text, options).data;
}

/**
 * Ultra-performance, trace-free parser for MSON.
 */
export function fastParseWithTrace(text: string): ParseResult {
  const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  text = text.replace(/\r\n/g, '\n').replace(/\n\r/g, '\n').replace(/\r/g, '\n');
  const lines = text.split('\n');
  let root: any = {};
  let rootConvertedToArray = false;
  let rootCompactMap: string[] | undefined = undefined;

  interface FastStackItem {
    level: number;
    key: string;
    parent: any;
    value: any;
    type: 'object' | 'array';
    isExplicitArray?: boolean;
    forcedBracketType?: 'array' | 'object' | null;
    compactMap?: string[];
    compactIndex?: number;
  }

  const stack: FastStackItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const len = rawLine.length;

    // Skip leading whitespace using fast charCode check
    let startIdx = 0;
    while (startIdx < len) {
      const code = rawLine.charCodeAt(startIdx);
      if (code === 32 || code === 9 || code === 13) {
        startIdx++;
      } else {
        break;
      }
    }

    if (startIdx === len) {
      continue;
    }

    const firstChar = rawLine.charCodeAt(startIdx);

    // Skip comment lines starting with <!--
    if (firstChar === 60 /* '<' */ && rawLine.startsWith('<!--', startIdx)) {
      continue;
    }

    const trimmedLine = rawLine.trim();
    if (trimmedLine === ']' || trimmedLine === '}') {
      if (stack.length > 0) {
        const active = stack[stack.length - 1];
        if ((trimmedLine === ']' && active.forcedBracketType === 'array') ||
            (trimmedLine === '}' && active.forcedBracketType === 'object')) {
          stack.pop();
          continue;
        }
      }
    }

    // Skip trailing whitespace
    let endIdx = len - 1;
    while (endIdx > startIdx) {
      const code = rawLine.charCodeAt(endIdx);
      if (code === 32 || code === 9 || code === 13) {
        endIdx--;
      } else {
        break;
      }
    }
    const trimmedLen = endIdx - startIdx + 1;

    // Top-level array trigger
    if (trimmedLen >= 2 && rawLine.charCodeAt(startIdx) === 91 /* '[' */ && rawLine.charCodeAt(endIdx) === 93 /* ']' */) {
      let isRootEmpty = false;
      if (Array.isArray(root)) {
        isRootEmpty = root.length === 0;
      } else {
        let hasKeys = false;
        for (const _ in root) {
          hasKeys = true;
          break;
        }
        isRootEmpty = !hasKeys;
      }
      if (stack.length === 0 && !rootConvertedToArray && isRootEmpty) {
        root = [];
        rootConvertedToArray = true;
        
        let inside = rawLine.slice(startIdx + 1, endIdx).trim();
        if (inside.length > 0) {
          rootCompactMap = inside.split(',').map(s => s.trim());
        }
        continue;
      }
    }

    // 1. Heading trigger (e.g. # Heading, ## Subheading)
    if (firstChar === 35 /* '#' */) {
      let hashCount = 0;
      while (startIdx + hashCount <= endIdx && rawLine.charCodeAt(startIdx + hashCount) === 35) {
        hashCount++;
      }

      let hStart = startIdx + hashCount;
      while (hStart <= endIdx) {
        const code = rawLine.charCodeAt(hStart);
        if (code === 32 || code === 9) {
          hStart++;
        } else {
          break;
        }
      }

      let actualHeadingName = '';
      let isExplicitArray = false;
      let forcedBracketType: 'array' | 'object' | null = null;
      let compactMap: string[] | undefined = undefined;
      let isCompactPrimitiveArray = false;
      let primitiveArrayValues: any[] = [];

      if (hStart <= endIdx) {
        const lastChar = rawLine.charCodeAt(endIdx);
        if (lastChar === 41 /* ')' */) {
          let openParen = -1;
          for (let k = endIdx - 1; k >= hStart; k--) {
            if (rawLine.charCodeAt(k) === 40 /* '(' */) {
              openParen = k;
              break;
            }
          }
          if (openParen !== -1) {
            isCompactPrimitiveArray = true;
            let inside = rawLine.slice(openParen + 1, endIdx).trim();
            if (inside.length > 0) {
              primitiveArrayValues = splitCompactValues(inside).map(s => parsePrimitiveValue(s.trim()));
            }
            let hEnd = openParen - 1;
            while (hEnd >= hStart) {
              const code = rawLine.charCodeAt(hEnd);
              if (code === 32 || code === 9) {
                hEnd--;
              } else {
                break;
              }
            }
            actualHeadingName = hStart <= hEnd ? rawLine.slice(hStart, hEnd + 1) : '';
          } else {
            actualHeadingName = rawLine.slice(hStart, endIdx + 1);
          }
        } else if (lastChar === 93 /* ']' */) {
          let openBracket = -1;
          for (let k = endIdx - 1; k >= hStart; k--) {
            if (rawLine.charCodeAt(k) === 91 /* '[' */) {
              openBracket = k;
              break;
            }
          }
          if (openBracket !== -1) {
            isExplicitArray = true;
            let inside = rawLine.slice(openBracket + 1, endIdx).trim();
            if (inside.length > 0) {
              compactMap = inside.split(',').map(s => s.trim());
            }
            let hEnd = openBracket - 1;
            while (hEnd >= hStart) {
              const code = rawLine.charCodeAt(hEnd);
              if (code === 32 || code === 9) {
                hEnd--;
              } else {
                break;
              }
            }
            actualHeadingName = hStart <= hEnd ? rawLine.slice(hStart, hEnd + 1) : '';
            
            // Check if actualHeadingName ends with (...) which indicates primitive array values for a mixed array
            let actualNameLength = actualHeadingName.length;
            if (actualNameLength > 0 && actualHeadingName.charCodeAt(actualNameLength - 1) === 41 /* ')' */) {
              let openParen = -1;
              for (let k = actualNameLength - 2; k >= 0; k--) {
                if (actualHeadingName.charCodeAt(k) === 40 /* '(' */) {
                  openParen = k;
                  break;
                }
              }
              if (openParen !== -1) {
                let insideParen = actualHeadingName.slice(openParen + 1, actualNameLength - 1).trim();
                if (insideParen.length > 0) {
                  primitiveArrayValues = splitCompactValues(insideParen).map(s => parsePrimitiveValue(s.trim()));
                }
                actualHeadingName = actualHeadingName.slice(0, openParen).trim();
              }
            }
          } else {
            actualHeadingName = rawLine.slice(hStart, endIdx + 1);
          }
        } else if (lastChar === 91 /* '[' */) {
          isExplicitArray = true;
          forcedBracketType = 'array';
          let hEnd = endIdx - 1;
          while (hEnd >= hStart) {
            const code = rawLine.charCodeAt(hEnd);
            if (code === 32 || code === 9) {
              hEnd--;
            } else {
              break;
            }
          }
          actualHeadingName = hStart <= hEnd ? rawLine.slice(hStart, hEnd + 1) : '';
        } else if (lastChar === 123 /* '{' */) {
          isExplicitArray = false;
          forcedBracketType = 'object';
          let hEnd = endIdx - 1;
          while (hEnd >= hStart) {
            const code = rawLine.charCodeAt(hEnd);
            if (code === 32 || code === 9) {
              hEnd--;
            } else {
              break;
            }
          }
          actualHeadingName = hStart <= hEnd ? rawLine.slice(hStart, hEnd + 1) : '';
        } else {
          actualHeadingName = rawLine.slice(hStart, endIdx + 1);
        }
      }

      while (stack.length > 0 && stack[stack.length - 1].level >= hashCount) {
        stack.pop();
      }

      let activeParent: any = root;
      let activeParentItem: FastStackItem | null = null;
      let activeCompactMap: string[] | undefined = rootCompactMap;
      if (stack.length > 0) {
        activeParentItem = stack[stack.length - 1];
        activeParent = activeParentItem.value;
        activeCompactMap = activeParentItem.compactMap;
      }

      if (!actualHeadingName) {
        if ((activeParentItem && activeParentItem.isExplicitArray) || Array.isArray(activeParent)) {
          actualHeadingName = '';
        } else {
          continue;
        }
      }

      const newNode: any = primitiveArrayValues.length > 0 ? primitiveArrayValues : (isExplicitArray ? [] : {});

      if (activeParentItem && activeParentItem.isExplicitArray) {
        activeParent.push(newNode);
      } else if (Array.isArray(activeParent)) {
        if (actualHeadingName === '') {
          activeParent.push(newNode);
        } else {
          activeParent.push({ [actualHeadingName]: newNode });
        }
      } else {
        activeParent[actualHeadingName] = newNode;
      }

      if (isCompactPrimitiveArray && !isExplicitArray) {
        continue;
      }

      stack.push({
        level: hashCount,
        key: actualHeadingName,
        parent: activeParent,
        value: newNode,
        type: isExplicitArray ? 'array' : 'object',
        isExplicitArray,
        forcedBracketType,
        compactMap: compactMap || activeCompactMap,
        compactIndex: 0
      });

      continue;
    }

    // 2. Array bullet trigger (e.g. * Item, - Item, + Item)
    if (firstChar === 42 || firstChar === 45 || firstChar === 43) { // '*', '-', '+'
      let bulletValIdx = startIdx + 1;
      while (bulletValIdx <= endIdx) {
        const code = rawLine.charCodeAt(bulletValIdx);
        if (code === 32 || code === 9) {
          bulletValIdx++;
        } else {
          break;
        }
      }
      const bulletValStr = bulletValIdx <= endIdx ? rawLine.slice(bulletValIdx, endIdx + 1) : '';

      let shouldPopActive = false;
      const activeItemForClosing = stack[stack.length - 1];
      let cleanBulletValStr = bulletValStr;
      if (activeItemForClosing) {
        if (activeItemForClosing.forcedBracketType === 'array' && bulletValStr.endsWith(']')) {
          cleanBulletValStr = bulletValStr.slice(0, -1).trim();
          shouldPopActive = true;
        } else if (activeItemForClosing.forcedBracketType === 'object' && bulletValStr.endsWith('}')) {
          cleanBulletValStr = bulletValStr.slice(0, -1).trim();
          shouldPopActive = true;
        }
      }

      let value: any;
      if (cleanBulletValStr.charCodeAt(0) === 96 /* '`' */) {
        const multiline = parseValueWithMultiline(cleanBulletValStr, lines, i);
        value = multiline.value;
        i = multiline.nextLineIndex;
      } else {
        value = parsePrimitiveValue(cleanBulletValStr);
      }

      if (stack.length === 0) {
        if (!root._items) {
          root._items = [];
        }
        root._items.push(value);
        continue;
      }

      // Pop stack if parent is an array and active item is an object (so bullet belongs to containing array)
      while (stack.length > 1 && stack[stack.length - 1].type !== 'array' && stack[stack.length - 2].type === 'array') {
        stack.pop();
      }

      const activeItem = stack[stack.length - 1];

      if (activeItem.type !== 'array') {
        let hasKeys = false;
        for (const k in activeItem.value) {
          if (Object.prototype.hasOwnProperty.call(activeItem.value, k)) {
            hasKeys = true;
            break;
          }
        }

        if (!hasKeys) {
          const parent = activeItem.parent;
          const key = activeItem.key;

          activeItem.type = 'array';
          activeItem.value = [];

          if (Array.isArray(parent)) {
            parent[parent.length - 1] = { [key]: activeItem.value };
          } else {
            parent[key] = activeItem.value;
          }
          activeItem.value.push(value);
        } else {
          if (!activeItem.value._items) {
            activeItem.value._items = [];
          }
          activeItem.value._items.push(value);
        }
      } else {
        activeItem.value.push(value);
      }

      if (shouldPopActive) {
        stack.pop();
      }

      continue;
    }

    // 3. Key-Value trigger (e.g. key: value)
    const colonIndex = findColonIndex(rawLine, startIdx);
    if (colonIndex !== -1 && colonIndex <= endIdx) {
      let kEnd = colonIndex - 1;
      while (kEnd >= startIdx) {
        const code = rawLine.charCodeAt(kEnd);
        if (code === 32 || code === 9) {
          kEnd--;
        } else {
          break;
        }
      }
      const key = startIdx <= kEnd ? rawLine.slice(startIdx, kEnd + 1) : '';

      let vStart = colonIndex + 1;
      while (vStart <= endIdx) {
        const code = rawLine.charCodeAt(vStart);
        if (code === 32 || code === 9) {
          vStart++;
        } else {
          break;
        }
      }
      let valStr = vStart <= endIdx ? rawLine.slice(vStart, endIdx + 1) : '';

      let shouldPopActive = false;
      const activeItem = stack[stack.length - 1];
      if (activeItem) {
        if (activeItem.forcedBracketType === 'array' && valStr.endsWith(']')) {
          valStr = valStr.slice(0, -1).trim();
          shouldPopActive = true;
        } else if (activeItem.forcedBracketType === 'object' && valStr.endsWith('}')) {
          valStr = valStr.slice(0, -1).trim();
          shouldPopActive = true;
        }
      }

      let parsedVal: any;
      if (valStr.charCodeAt(0) === 96 /* '`' */) {
        const multiline = parseValueWithMultiline(valStr, lines, i);
        parsedVal = multiline.value;
        i = multiline.nextLineIndex;
      } else {
        parsedVal = parsePrimitiveValue(valStr);
      }

      if (stack.length === 0) {
        root[key] = parsedVal;
        continue;
      }

      if (activeItem.type === 'array') {
        let lastItem = activeItem.value[activeItem.value.length - 1];
        if (!lastItem || typeof lastItem !== 'object' || Array.isArray(lastItem)) {
          lastItem = {};
          activeItem.value.push(lastItem);
        }
        lastItem[key] = parsedVal;
        if (shouldPopActive) {
          stack.pop();
        }
        continue;
      }

      activeItem.value[key] = parsedVal;
      if (shouldPopActive) {
        stack.pop();
      }
      continue;
    }

    // 4. Compact Array Value or Unknown line
    const activeItemForValue = stack[stack.length - 1];
    if (activeItemForValue && activeItemForValue.compactMap) {
      let valStr = rawLine.slice(startIdx, endIdx + 1);
      let shouldPopActive = false;
      if (activeItemForValue.forcedBracketType === 'array' && valStr.endsWith(']')) {
        valStr = valStr.slice(0, -1).trim();
        shouldPopActive = true;
      } else if (activeItemForValue.forcedBracketType === 'object' && valStr.endsWith('}')) {
        valStr = valStr.slice(0, -1).trim();
        shouldPopActive = true;
      }

      let parsedVal: any;
      if (valStr.charCodeAt(0) === 96 /* '`' */) {
        const multiline = parseValueWithMultiline(valStr, lines, i);
        parsedVal = multiline.value;
        i = multiline.nextLineIndex;
      } else {
        parsedVal = parsePrimitiveValue(valStr);
      }
      
      const key = activeItemForValue.compactMap[activeItemForValue.compactIndex || 0];
      if (key) {
        activeItemForValue.value[key] = parsedVal;
        activeItemForValue.compactIndex = (activeItemForValue.compactIndex || 0) + 1;
      }

      if (shouldPopActive) {
        stack.pop();
      }
      continue;
    }
  }

  const duration = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime;
  return {
    data: root,
    trace: [],
    stats: {
      parseTimeMs: duration,
      linesProcessed: lines.length,
      charCount: text.length,
      estimatedTokens: Math.ceil(text.length / 3.8),
      jsonCharCount: 0,
      jsonEstimatedTokens: 0,
      tokenSavingsPercent: 0
    }
  };
}

/**
 * Parses MSON text into a JavaScript Object / Array with step-by-step trace info.
 */
export function parseWithTrace(text: string, options?: ParseOptions): ParseResult {
  if (options?.noTrace) {
    return fastParseWithTrace(text);
  }

  const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  text = text.replace(/\r\n/g, '\n').replace(/\n\r/g, '\n').replace(/\r/g, '\n');
  const lines = text.split('\n');
  const trace: ParserTraceStep[] = [];
  const noTrace = options?.noTrace ?? false;
  
  let root: any = {};
  let rootConvertedToArray = false;
  let rootCompactMap: string[] | undefined = undefined;
  
  // Stack structure: holds metadata of active parent headers
  interface StackItem {
    level: number;
    key: string;
    parent: any;
    value: any;
    type: 'object' | 'array';
    isExplicitArray?: boolean;
    forcedBracketType?: 'array' | 'object' | null;
    compactMap?: string[];
    compactIndex?: number;
  }
  
  const stack: StackItem[] = [];

  const getStackNames = () => {
    if (noTrace) return [];
    return stack.map(s => `${'#'.repeat(s.level)} ${s.key}`);
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const lineNumber = i + 1;

    // Find first non-whitespace character in rawLine
    let startIdx = 0;
    const len = rawLine.length;
    while (startIdx < len) {
      const code = rawLine.charCodeAt(startIdx);
      if (code === 32 || code === 9 || code === 13) {
        startIdx++;
      } else {
        break;
      }
    }

    // Skip empty lines
    if (startIdx === len) {
      if (!noTrace) {
        trace.push({
          lineNumber,
          lineText: rawLine,
          action: 'Skipped empty line or comment',
          stackDepth: stack.length,
          currentStack: getStackNames(),
          status: 'info'
        });
      }
      continue;
    }

    // Check for comment starting with <!--
    const firstChar = rawLine.charCodeAt(startIdx);
    if (firstChar === 60 /* '<' */ && rawLine.startsWith('<!--', startIdx)) {
      if (!noTrace) {
        trace.push({
          lineNumber,
          lineText: rawLine,
          action: 'Skipped empty line or comment',
          stackDepth: stack.length,
          currentStack: getStackNames(),
          status: 'info'
        });
      }
      continue;
    }

    const trimmedLine = rawLine.trim();
    if (trimmedLine === ']' || trimmedLine === '}') {
      if (stack.length > 0) {
        const active = stack[stack.length - 1];
        if ((trimmedLine === ']' && active.forcedBracketType === 'array') ||
            (trimmedLine === '}' && active.forcedBracketType === 'object')) {
          stack.pop();
          if (!noTrace) {
            trace.push({
              lineNumber,
              lineText: rawLine,
              action: `Closed forced bracket and popped "${active.key}" from stack`,
              stackDepth: stack.length,
              currentStack: getStackNames(),
              status: 'success'
            });
          }
          continue;
        }
      }
    }

    // Find trailing non-whitespace index in rawLine
    let endIdx = len - 1;
    while (endIdx > startIdx) {
      const code = rawLine.charCodeAt(endIdx);
      if (code === 32 || code === 9 || code === 13) {
        endIdx--;
      } else {
        break;
      }
    }
    const trimmedLen = endIdx - startIdx + 1;

    // Top-level array trigger
    if (trimmedLen >= 2 && rawLine.charCodeAt(startIdx) === 91 /* '[' */ && rawLine.charCodeAt(endIdx) === 93 /* ']' */) {
      let isRootEmpty = false;
      if (Array.isArray(root)) {
        isRootEmpty = root.length === 0;
      } else {
        let hasKeys = false;
        for (const _ in root) {
          hasKeys = true;
          break;
        }
        isRootEmpty = !hasKeys;
      }
      if (stack.length === 0 && !rootConvertedToArray && isRootEmpty) {
        root = [];
        rootConvertedToArray = true;
        
        let inside = rawLine.slice(startIdx + 1, endIdx).trim();
        if (inside.length > 0) {
          rootCompactMap = inside.split(',').map(s => s.trim());
        }

        if (!noTrace) {
          trace.push({
            lineNumber,
            lineText: rawLine,
            action: rootCompactMap ? `Converted root to Array with compact map [${rootCompactMap.join(',')}]` : 'Converted root container to an Array via top-level "[]"',
            stackDepth: stack.length,
            currentStack: getStackNames(),
            status: 'success'
          });
        }
        continue;
      }
    }

    // 1. Heading trigger (e.g. # Heading, ## Subheading)
    if (firstChar === 35 /* '#' */) {
      let hashCount = 0;
      while (startIdx + hashCount <= endIdx && rawLine.charCodeAt(startIdx + hashCount) === 35) {
        hashCount++;
      }
      
      // Extract headingName. Strip spaces after hashes.
      let hStart = startIdx + hashCount;
      while (hStart <= endIdx) {
        const code = rawLine.charCodeAt(hStart);
        if (code === 32 || code === 9) {
          hStart++;
        } else {
          break;
        }
      }
      
      const headingName = hStart <= endIdx ? rawLine.slice(hStart, endIdx + 1) : '';

      // Adjust stack for heading level
      while (stack.length > 0 && stack[stack.length - 1].level >= hashCount) {
        stack.pop();
      }

      // Determine active parent container
      let activeParent: any = root;
      let activeParentItem: StackItem | null = null;
      let activeCompactMap: string[] | undefined = rootCompactMap;
      if (stack.length > 0) {
        activeParentItem = stack[stack.length - 1];
        activeParent = activeParentItem.value;
        activeCompactMap = activeParentItem.compactMap;
      }

      let actualHeadingName = headingName;
      let isExplicitArray = false;
      let forcedBracketType: 'array' | 'object' | null = null;
      let compactMap: string[] | undefined = undefined;
      let isCompactPrimitiveArray = false;
      let primitiveArrayValues: any[] = [];

      if (headingName.endsWith(')')) {
        let openParen = -1;
        for (let k = headingName.length - 2; k >= 0; k--) {
          if (headingName.charCodeAt(k) === 40 /* '(' */) {
            openParen = k;
            break;
          }
        }
        if (openParen !== -1) {
          isCompactPrimitiveArray = true;
          let inside = headingName.slice(openParen + 1, -1).trim();
          if (inside.length > 0) {
            primitiveArrayValues = splitCompactValues(inside).map(s => parsePrimitiveValue(s.trim()));
          }
          actualHeadingName = headingName.slice(0, openParen).trim();
        }
      } else if (headingName.endsWith(']')) {
        let openBracket = -1;
        for (let k = headingName.length - 2; k >= 0; k--) {
          if (headingName.charCodeAt(k) === 91 /* '[' */) {
            openBracket = k;
            break;
          }
        }
          if (openBracket !== -1) {
          isExplicitArray = true;
          let inside = headingName.slice(openBracket + 1, -1).trim();
          if (inside.length > 0) {
            compactMap = inside.split(',').map(s => s.trim());
          }
          actualHeadingName = headingName.slice(0, openBracket).trim();
          
          let actualNameLength = actualHeadingName.length;
          if (actualNameLength > 0 && actualHeadingName.charCodeAt(actualNameLength - 1) === 41 /* ')' */) {
            let openParen = -1;
            for (let k = actualNameLength - 2; k >= 0; k--) {
              if (actualHeadingName.charCodeAt(k) === 40 /* '(' */) {
                openParen = k;
                break;
              }
            }
            if (openParen !== -1) {
              let insideParen = actualHeadingName.slice(openParen + 1, actualNameLength - 1).trim();
              if (insideParen.length > 0) {
                primitiveArrayValues = splitCompactValues(insideParen).map(s => parsePrimitiveValue(s.trim()));
              }
              actualHeadingName = actualHeadingName.slice(0, openParen).trim();
            }
          }
        } else {
          // fallback
          actualHeadingName = headingName;
        }
      } else if (headingName.endsWith('[')) {
        actualHeadingName = headingName.slice(0, -1).trim();
        isExplicitArray = true;
        forcedBracketType = 'array';
      } else if (headingName.endsWith('{')) {
        actualHeadingName = headingName.slice(0, -1).trim();
        isExplicitArray = false;
        forcedBracketType = 'object';
      }

      if (!actualHeadingName) {
        if ((activeParentItem && activeParentItem.isExplicitArray) || Array.isArray(activeParent)) {
          actualHeadingName = '';
        } else {
          if (!noTrace) {
            trace.push({
              lineNumber,
              lineText: rawLine,
              action: `Warning: Empty heading name at level ${hashCount}`,
              stackDepth: stack.length,
              currentStack: getStackNames(),
              status: 'warning'
            });
          }
          continue;
        }
      }

      // Create new child node
      const newNode: any = primitiveArrayValues.length > 0 ? primitiveArrayValues : (isExplicitArray ? [] : {});
      
      // If parent is an explicit array of objects, we push straight into it
      if (activeParentItem && activeParentItem.isExplicitArray) {
        activeParent.push(newNode);
        if (!noTrace) {
          trace.push({
            lineNumber,
            lineText: rawLine,
            action: `Pushed new item into explicit array "${activeParentItem.key}" via heading "${actualHeadingName}"`,
            stackDepth: stack.length,
            currentStack: getStackNames(),
            status: 'success'
          });
        }
      } else if (Array.isArray(activeParent)) {
        if (actualHeadingName === '') {
          activeParent.push(newNode);
          if (!noTrace) {
            trace.push({
              lineNumber,
              lineText: rawLine,
              action: `Pushed anonymous object directly into parent Array`,
              stackDepth: stack.length,
              currentStack: getStackNames(),
              status: 'success'
            });
          }
        } else {
          activeParent.push({ [actualHeadingName]: newNode });
          if (!noTrace) {
            trace.push({
              lineNumber,
              lineText: rawLine,
              action: `Created heading "${actualHeadingName}" at level ${hashCount} and pushed inside parent Array`,
              stackDepth: stack.length,
              currentStack: getStackNames(),
              status: 'success'
            });
          }
        }
      } else {
        activeParent[actualHeadingName] = newNode;
        if (!noTrace) {
          trace.push({
            lineNumber,
            lineText: rawLine,
            action: `Created heading "${actualHeadingName}" at level ${hashCount} in parent Object${isExplicitArray ? ' as Array' : ''}`,
            stackDepth: stack.length,
            currentStack: getStackNames(),
            status: 'success'
          });
        }
      }

      if (isCompactPrimitiveArray && !isExplicitArray) {
        if (!noTrace) {
          trace.push({
            lineNumber,
            lineText: rawLine,
            action: `Created compact primitive array for "${actualHeadingName}" at level ${hashCount}`,
            stackDepth: stack.length,
            currentStack: getStackNames(),
            status: 'success'
          });
        }
        continue;
      }

      // Push new container to the stack
      stack.push({
        level: hashCount,
        key: actualHeadingName,
        parent: activeParent,
        value: newNode,
        type: isExplicitArray ? 'array' : 'object',
        isExplicitArray,
        forcedBracketType,
        compactMap: compactMap || activeCompactMap,
        compactIndex: 0
      });

      continue;
    }

    // 2. Array bullet trigger (e.g. * Item, - Item, + Item)
    if (firstChar === 42 || firstChar === 45 || firstChar === 43) { // '*', '-', '+'
      let bulletValIdx = startIdx + 1;
      while (bulletValIdx <= endIdx) {
        const code = rawLine.charCodeAt(bulletValIdx);
        if (code === 32 || code === 9) {
          bulletValIdx++;
        } else {
          break;
        }
      }
      const bulletValStr = bulletValIdx <= endIdx ? rawLine.slice(bulletValIdx, endIdx + 1) : '';

      let shouldPopActive = false;
      const activeItemForClosing = stack[stack.length - 1];
      let cleanBulletValStr = bulletValStr;
      if (activeItemForClosing) {
        if (activeItemForClosing.forcedBracketType === 'array' && bulletValStr.endsWith(']')) {
          cleanBulletValStr = bulletValStr.slice(0, -1).trim();
          shouldPopActive = true;
        } else if (activeItemForClosing.forcedBracketType === 'object' && bulletValStr.endsWith('}')) {
          cleanBulletValStr = bulletValStr.slice(0, -1).trim();
          shouldPopActive = true;
        }
      }

      const { value, nextLineIndex } = parseValueWithMultiline(cleanBulletValStr, lines, i);
      i = nextLineIndex;

      if (stack.length === 0) {
        if (!root._items) {
          root._items = [];
        }
        root._items.push(value);
        if (!noTrace) {
          trace.push({
            lineNumber,
            lineText: rawLine,
            action: `No active heading. Pushed bullet item to root implicit list "_items"`,
            stackDepth: stack.length,
            currentStack: getStackNames(),
            status: 'info'
          });
        }
        continue;
      }

      // Pop stack if parent is an array and active item is an object (so bullet belongs to containing array)
      while (stack.length > 1 && stack[stack.length - 1].type !== 'array' && stack[stack.length - 2].type === 'array') {
        const popped = stack.pop();
        if (!noTrace && popped) {
          trace.push({
            lineNumber,
            lineText: rawLine,
            action: `Popped object heading "${popped.key}" from stack because parent is an Array, sibling to upcoming bullet`,
            stackDepth: stack.length,
            currentStack: getStackNames(),
            status: 'info'
          });
        }
      }

      const activeItem = stack[stack.length - 1];

      // Convert active object container to an array if it is empty and isn't one already.
      // If it already contains properties, preserve the object and push the bullet item to an implicit list "_items" within the object.
      if (activeItem.type !== 'array') {
        let hasKeys = false;
        for (const k in activeItem.value) {
          if (Object.prototype.hasOwnProperty.call(activeItem.value, k)) {
            hasKeys = true;
            break;
          }
        }

        if (!hasKeys) {
          const parent = activeItem.parent;
          const key = activeItem.key;
          
          activeItem.type = 'array';
          activeItem.value = [];
          
          if (Array.isArray(parent)) {
            parent[parent.length - 1] = { [key]: activeItem.value };
          } else {
            parent[key] = activeItem.value;
          }

          if (!noTrace) {
            trace.push({
              lineNumber,
              lineText: rawLine,
              action: `Array trigger: Converted heading "${key}" to an Array because it was an empty Object`,
              stackDepth: stack.length,
              currentStack: getStackNames(),
              status: 'info'
            });
          }
          activeItem.value.push(value);
          if (!noTrace) {
            trace.push({
              lineNumber,
              lineText: rawLine,
              action: `Pushed item "${value}" (type: ${typeof value}) into array "${activeItem.key}"`,
              stackDepth: stack.length,
              currentStack: getStackNames(),
              status: 'success'
            });
          }
        } else {
          if (!activeItem.value._items) {
            activeItem.value._items = [];
          }
          activeItem.value._items.push(value);
          if (!noTrace) {
            trace.push({
              lineNumber,
              lineText: rawLine,
              action: `Pushed bullet item "${value}" to implicit list "_items" inside non-empty Object under heading "${activeItem.key}"`,
              stackDepth: stack.length,
              currentStack: getStackNames(),
              status: 'info'
            });
          }
        }
      } else {
        // Push value to active array
        activeItem.value.push(value);
        if (!noTrace) {
          trace.push({
            lineNumber,
            lineText: rawLine,
            action: `Pushed item "${value}" (type: ${typeof value}) into array "${activeItem.key}"`,
            stackDepth: stack.length,
            currentStack: getStackNames(),
            status: 'success'
          });
        }
      }

      if (shouldPopActive) {
        const popped = stack.pop();
        if (!noTrace && popped) {
          trace.push({
            lineNumber,
            lineText: rawLine,
            action: `Closed forced bracket and popped "${popped.key}" from stack`,
            stackDepth: stack.length,
            currentStack: getStackNames(),
            status: 'success'
          });
        }
      }

      continue;
    }

    // 3. Key-Value trigger (e.g. key: value)
    const colonIndex = findColonIndex(rawLine, startIdx);
    if (colonIndex !== -1 && colonIndex <= endIdx) {
      let kEnd = colonIndex - 1;
      while (kEnd >= startIdx) {
        const code = rawLine.charCodeAt(kEnd);
        if (code === 32 || code === 9) {
          kEnd--;
        } else {
          break;
        }
      }
      const key = startIdx <= kEnd ? rawLine.slice(startIdx, kEnd + 1) : '';
      
      let vStart = colonIndex + 1;
      while (vStart <= endIdx) {
        const code = rawLine.charCodeAt(vStart);
        if (code === 32 || code === 9) {
          vStart++;
        } else {
          break;
        }
      }
      let valStr = vStart <= endIdx ? rawLine.slice(vStart, endIdx + 1) : '';

      let shouldPopActive = false;
      const activeItem = stack[stack.length - 1];
      if (activeItem) {
        if (activeItem.forcedBracketType === 'array' && valStr.endsWith(']')) {
          valStr = valStr.slice(0, -1).trim();
          shouldPopActive = true;
        } else if (activeItem.forcedBracketType === 'object' && valStr.endsWith('}')) {
          valStr = valStr.slice(0, -1).trim();
          shouldPopActive = true;
        }
      }

      const { value: parsedVal, nextLineIndex } = parseValueWithMultiline(valStr, lines, i);
      i = nextLineIndex;

      if (stack.length === 0) {
        root[key] = parsedVal;
        if (!noTrace) {
          trace.push({
            lineNumber,
            lineText: rawLine,
            action: `Set root key "${key}" to "${parsedVal}"`,
            stackDepth: stack.length,
            currentStack: getStackNames(),
            status: 'success'
          });
        }
        continue;
      }

      if (activeItem.type === 'array') {
        let lastItem = activeItem.value[activeItem.value.length - 1];
        if (!lastItem || typeof lastItem !== 'object' || Array.isArray(lastItem)) {
          lastItem = {};
          activeItem.value.push(lastItem);
          if (!noTrace) {
            trace.push({
              lineNumber,
              lineText: rawLine,
              action: `Created implicit object inside array "${activeItem.key}" to hold key "${key}"`,
              stackDepth: stack.length,
              currentStack: getStackNames(),
              status: 'info'
            });
          }
        }
        lastItem[key] = parsedVal;
        if (!noTrace) {
          trace.push({
            lineNumber,
            lineText: rawLine,
            action: `Set key "${key}" to "${parsedVal}" in implicit object inside array "${activeItem.key}"`,
            stackDepth: stack.length,
            currentStack: getStackNames(),
            status: 'success'
          });
        }
        if (shouldPopActive) {
          stack.pop();
          if (!noTrace) {
            trace.push({
              lineNumber,
              lineText: rawLine,
              action: `Closed forced bracket and popped "${activeItem.key}" from stack`,
              stackDepth: stack.length,
              currentStack: getStackNames(),
              status: 'success'
            });
          }
        }
        continue;
      }

      activeItem.value[key] = parsedVal;
      if (!noTrace) {
        trace.push({
          lineNumber,
          lineText: rawLine,
          action: `Set key "${key}" to "${parsedVal}" in active heading "${activeItem.key}"`,
          stackDepth: stack.length,
          currentStack: getStackNames(),
          status: 'success'
        });
      }
      if (shouldPopActive) {
        stack.pop();
        if (!noTrace) {
          trace.push({
            lineNumber,
            lineText: rawLine,
            action: `Closed forced bracket and popped "${activeItem.key}" from stack`,
            stackDepth: stack.length,
            currentStack: getStackNames(),
            status: 'success'
          });
        }
      }
      continue;
    }

    // 4. Compact Array Value or Unknown line
    const activeItemForValue = stack[stack.length - 1];
    if (activeItemForValue && activeItemForValue.compactMap) {
      let valStr = rawLine.slice(startIdx, endIdx + 1);
      let shouldPopActive = false;
      if (activeItemForValue.forcedBracketType === 'array' && valStr.endsWith(']')) {
        valStr = valStr.slice(0, -1).trim();
        shouldPopActive = true;
      } else if (activeItemForValue.forcedBracketType === 'object' && valStr.endsWith('}')) {
        valStr = valStr.slice(0, -1).trim();
        shouldPopActive = true;
      }

      const { value: parsedVal, nextLineIndex } = parseValueWithMultiline(valStr, lines, i);
      i = nextLineIndex;

      const key = activeItemForValue.compactMap[activeItemForValue.compactIndex || 0];
      if (key) {
        activeItemForValue.value[key] = parsedVal;
        activeItemForValue.compactIndex = (activeItemForValue.compactIndex || 0) + 1;
        if (!noTrace) {
          trace.push({
            lineNumber,
            lineText: rawLine,
            action: `Set key "${key}" to "${parsedVal}" in compact array item "${activeItemForValue.key}"`,
            stackDepth: stack.length,
            currentStack: getStackNames(),
            status: 'success'
          });
        }
      }

      if (shouldPopActive) {
        const popped = stack.pop();
        if (!noTrace && popped) {
          trace.push({
            lineNumber,
            lineText: rawLine,
            action: `Closed forced bracket and popped "${popped.key}" from stack`,
            stackDepth: stack.length,
            currentStack: getStackNames(),
            status: 'success'
          });
        }
      }
      continue;
    }

    // Unknown lines
    if (!noTrace) {
      trace.push({
        lineNumber,
        lineText: rawLine,
        action: `Unparsed content: Line skipped or treated as plain text`,
        stackDepth: stack.length,
        currentStack: getStackNames(),
        status: 'warning'
      });
    }
  }

  const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const parseTimeMs = Number((endTime - startTime).toFixed(3));
  
  // Calculate stats
  const charCount = text.length;
  const estimatedTokens = Math.ceil(charCount / 4.1);
  
  let jsonCharCount = 0;
  let jsonEstimatedTokens = 0;
  let tokenSavingsPercent = 0;

  if (!noTrace) {
    const jsonString = JSON.stringify(root, null, 2);
    jsonCharCount = jsonString.length;
    jsonEstimatedTokens = Math.ceil(jsonCharCount / 3.7);
    tokenSavingsPercent = Number((((jsonEstimatedTokens - estimatedTokens) / jsonEstimatedTokens) * 100).toFixed(1));
  }

  return {
    data: root,
    trace,
    stats: {
      parseTimeMs,
      linesProcessed: lines.length,
      charCount,
      estimatedTokens,
      jsonCharCount,
      jsonEstimatedTokens,
      tokenSavingsPercent: isNaN(tokenSavingsPercent) ? 0 : tokenSavingsPercent
    }
  };
}

/**
 * Stringifies a JavaScript object/array back into MSON text recursively.
 */
export function stringify(obj: any, level: number = 0, parentKey?: string, options: { compact?: boolean } = {}): string {
  const isCompactMode = options.compact !== false;
  if (obj === null || obj === undefined) return '';

  let output = '';

  const hashes = (lvl: number) => '#'.repeat(lvl === 0 ? 1 : lvl);

  if (Array.isArray(obj)) {
    if (level === 0) {
      if (isCompactMode) {
        const allObjects = obj.length > 0 && obj.every(item => typeof item === 'object' && item !== null && !Array.isArray(item));
        if (allObjects) {
          const keySet = new Set<string>();
          obj.forEach(item => Object.keys(item).forEach(k => keySet.add(k)));
          const compactKeys = Array.from(keySet);
          if (!compactKeys.some(k => k.includes(','))) {
            output += `[${compactKeys.join(',')}]\n`;
            if (!isCompactMode) output += '\n';
            for (const item of obj) {
              output += `##\n`;
              for (const ck of compactKeys) {
                const cv = item[ck];
                if (cv === undefined) {
                  output += `null\n`;
                } else {
                  output += `${stringifyPrimitiveValue(cv, options)}\n`;
                }
              }
            }
            return output.trim() + '\n';
          }
        }
      }
      output += '[]\n';
      if (!isCompactMode) output += '\n';
    }
    
    let itemName = 'Item';
    if (parentKey) {
      if (parentKey.endsWith('ies')) {
        itemName = parentKey.slice(0, -3) + 'y';
      } else if (parentKey.endsWith('s') && !parentKey.endsWith('ss')) {
        itemName = parentKey.slice(0, -1);
      } else {
        itemName = parentKey;
      }
      itemName = itemName.charAt(0).toUpperCase() + itemName.slice(1);
    }

    const primitives = obj.filter(item => typeof item !== 'object' || item === null);
    const complex = obj.filter(item => typeof item === 'object' && item !== null);
    const sortedItems = [...primitives, ...complex];

    for (let i = 0; i < sortedItems.length; i++) {
      const item = sortedItems[i];
      if (typeof item === 'object' && item !== null) {
        const nextLevel = level + 1;
        const headingSuffix = Array.isArray(item) ? '[]' : '';
        const headerSpace = isCompactMode ? '' : ' ';
        const finalItemName = isCompactMode ? '' : itemName;
        
        if (!isCompactMode && i > 0 && (typeof sortedItems[i - 1] !== 'object' || sortedItems[i - 1] === null)) {
          output += '\n';
        }
        
        output += `${hashes(nextLevel)}${headerSpace}${finalItemName}${headingSuffix}\n`;
        const nestedString = stringify(item, nextLevel, undefined, options);
        if (nestedString) {
          output += nestedString;
        }
        if (!isCompactMode && i < sortedItems.length - 1) output += '\n';
      } else {
        output += `* ${stringifyPrimitiveValue(item, options)}\n`;
      }
    }
  } else if (typeof obj === 'object') {
    const keys = Object.keys(obj);
    
    const primitives = keys.filter(k => typeof obj[k] !== 'object' || obj[k] === null);
    const complex = keys.filter(k => typeof obj[k] === 'object' && obj[k] !== null);

    for (const key of primitives) {
      const kvSpace = isCompactMode ? '' : ' ';
      output += `${key}:${kvSpace}${stringifyPrimitiveValue(obj[key], options)}\n`;
    }

    if (primitives.length > 0 && complex.length > 0) {
      if (!isCompactMode) {
        output += '\n';
      }
    }

    for (let i = 0; i < complex.length; i++) {
      const key = complex[i];
      const nextLevel = level + 1;
      const val = obj[key];
      const isArrayOfObjects = Array.isArray(val) && val.some(item => typeof item === 'object' && item !== null);
      
      let isCompact = false;
      let compactKeys: string[] = [];
      let isCompactPrimitiveArray = false;

      if (isCompactMode && Array.isArray(val)) {
        const allObjects = val.length > 0 && val.every(item => typeof item === 'object' && item !== null && !Array.isArray(item));
        const allPrimitives = val.length > 0 && val.every(item => typeof item !== 'object' || item === null);
        
        if (allObjects) {
          const keySet = new Set<string>();
          val.forEach(item => Object.keys(item).forEach(k => keySet.add(k)));
          compactKeys = Array.from(keySet);
          if (!compactKeys.some(k => k.includes(','))) {
            isCompact = true;
          }
        } else if (allPrimitives) {
          const hasCommas = val.some(item => typeof item === 'string' && item.includes(','));
          // if (!hasCommas) { // Removed as per prompt rules to allow commas inside ()
            isCompactPrimitiveArray = true;
          // }
        }
      }

      if (isCompactPrimitiveArray) {
        const headerSpace = isCompactMode ? '' : ' ';
        const prims = val.map((item: any) => stringifyPrimitiveValue(item, { ...options, inCompactArray: true })).join(',');
        output += `${hashes(nextLevel)}${headerSpace}${key}(${prims})\n`;
        if (!isCompactMode) output += '\n';
      } else if (isCompact) {
        const headerSpace = isCompactMode ? '' : ' ';
        output += `${hashes(nextLevel)}${headerSpace}${key}[${compactKeys.join(',')}]\n`;
        for (const item of val) {
          output += `${hashes(nextLevel + 1)}\n`;
          for (const ck of compactKeys) {
            const cv = item[ck];
            if (cv === undefined) {
              output += `null\n`;
            } else {
              output += `${stringifyPrimitiveValue(cv, options)}\n`;
            }
          }
        }
        if (!isCompactMode && i < complex.length - 1) output += '\n';
      } else {
        const headerSpace = isCompactMode ? '' : ' ';
        let headingNameSuffix = isArrayOfObjects ? '[]' : '';
        let valToPass = val;

        if (isCompactMode && Array.isArray(val)) {
          const hasObjects = val.some(item => typeof item === 'object' && item !== null);
          if (hasObjects) {
            const mixedPrimitives = val.filter(item => typeof item !== 'object' || item === null);
            if (mixedPrimitives.length > 0) {
              const primsStr = mixedPrimitives.map((item: any) => stringifyPrimitiveValue(item, { ...options, inCompactArray: true })).join(',');
              headingNameSuffix = `(${primsStr})[]`;
              valToPass = val.filter(item => typeof item === 'object' && item !== null);
            }
          }
        }

        output += `${hashes(nextLevel)}${headerSpace}${key}${headingNameSuffix}\n`;
        
        const nestedString = stringify(valToPass, nextLevel, key, options);
        if (nestedString) {
          output += nestedString;
        }
        if (!isCompactMode && i < complex.length - 1) output += '\n';
      }
    }
  }

  return output.trim() + '\n';
}

// Aliases for compatibility
export { parse as parseMSON, stringify as stringifyMSON, parseWithTrace as parseMaSON, stringify as stringifyMaSON };
