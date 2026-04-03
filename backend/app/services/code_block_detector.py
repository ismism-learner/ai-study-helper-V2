import os
import re
import json
import logging
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path

logger = logging.getLogger(__name__)

class CodeBlockDetector:
    def __init__(self):
        self.code_patterns = [
            (r'^\s*(def|class|function|var|let|const|import|from|export|package|namespace|using|include|#include|#import)\s+', 'keyword'),
            (r'^\s*(if|else|elif|for|while|switch|case|try|catch|finally|do)\s*[\(\{]?', 'control'),
            (r'^\s*(return|break|continue|throw|yield)\s+', 'flow'),
            (r'.*[{}\[\]();]\s*$', 'syntax'),
            (r'^\s*//.*$|^\s*/\*.*\*/|^\s*#.*$', 'comment'),
            (r'^\s*\d+\.\s+', 'numbered'),
            (r'^\s*[-*+]\s+', 'bullet'),
        ]
        
        self.code_keywords = {
            'python': ['def', 'class', 'import', 'from', 'return', 'if', 'elif', 'else', 'for', 'while', 'try', 'except', 'finally', 'with', 'as', 'lambda', 'yield', 'raise', 'pass', 'break', 'continue', 'True', 'False', 'None', 'self', 'print', 'len', 'range', 'str', 'int', 'float', 'list', 'dict', 'set', 'tuple'],
            'javascript': ['function', 'const', 'let', 'var', 'return', 'if', 'else', 'for', 'while', 'switch', 'case', 'break', 'continue', 'try', 'catch', 'finally', 'class', 'extends', 'import', 'export', 'default', 'async', 'await', 'new', 'this', 'super', 'true', 'false', 'null', 'undefined', 'console', 'log'],
            'java': ['public', 'private', 'protected', 'class', 'interface', 'extends', 'implements', 'static', 'final', 'void', 'return', 'if', 'else', 'for', 'while', 'switch', 'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'throws', 'new', 'this', 'super', 'true', 'false', 'null', 'import', 'package'],
            'cpp': ['include', 'define', 'ifdef', 'ifndef', 'endif', 'namespace', 'using', 'class', 'struct', 'public', 'private', 'protected', 'virtual', 'override', 'static', 'const', 'void', 'return', 'if', 'else', 'for', 'while', 'switch', 'case', 'break', 'continue', 'try', 'catch', 'throw', 'new', 'delete', 'this', 'true', 'false', 'nullptr'],
            'go': ['package', 'import', 'func', 'return', 'var', 'const', 'type', 'struct', 'interface', 'map', 'chan', 'if', 'else', 'for', 'range', 'switch', 'case', 'default', 'break', 'continue', 'goto', 'fallthrough', 'defer', 'go', 'select', 'true', 'false', 'nil', 'make', 'new', 'len', 'cap', 'append', 'copy', 'delete', 'close'],
        }
        
        self.code_indent_chars = ['    ', '\t', '  ']
        
    def detect_code_blocks(self, text: str) -> List[Dict[str, Any]]:
        if not text or not text.strip():
            return []
        
        lines = text.split('\n')
        blocks = []
        current_block = None
        
        for i, line in enumerate(lines):
            is_code_line, code_type, confidence = self._analyze_line(line, lines, i)
            
            if is_code_line:
                if current_block is None:
                    current_block = {
                        'type': 'code',
                        'language': code_type,
                        'confidence': confidence,
                        'start_line': i,
                        'end_line': i,
                        'lines': [line],
                        'content': line
                    }
                else:
                    if code_type and code_type != 'unknown':
                        if current_block['language'] == 'unknown':
                            current_block['language'] = code_type
                    current_block['end_line'] = i
                    current_block['lines'].append(line)
                    current_block['content'] += '\n' + line
            else:
                if current_block is not None:
                    if len(current_block['lines']) >= 2:
                        blocks.append(current_block)
                    current_block = None
        
        if current_block is not None and len(current_block['lines']) >= 2:
            blocks.append(current_block)
        
        return blocks
    
    def _analyze_line(self, line: str, all_lines: List[str], line_index: int) -> Tuple[bool, str, float]:
        stripped = line.strip()
        
        if not stripped:
            return False, 'unknown', 0.0
        
        for pattern, pattern_type in self.code_patterns:
            if re.match(pattern, stripped):
                return True, 'unknown', 0.7
        
        has_brackets = bool(re.search(r'[{}\[\]()<>]', stripped))
        has_operators = bool(re.search(r'[=+\-*/%&|^!<>]', stripped))
        has_semicolon = stripped.endswith(';') or stripped.endswith('{') or stripped.endswith('}')
        
        if has_brackets or has_semicolon:
            return True, 'unknown', 0.6
        
        words = re.findall(r'\b\w+\b', stripped)
        if words:
            for lang, keywords in self.code_keywords.items():
                keyword_count = sum(1 for w in words if w in keywords)
                if keyword_count >= 2:
                    return True, lang, 0.8
                elif keyword_count == 1:
                    return True, lang, 0.5
        
        is_indented = any(line.startswith(indent) for indent in self.code_indent_chars)
        if is_indented and (has_operators or has_brackets):
            return True, 'unknown', 0.5
        
        return False, 'unknown', 0.0
    
    def extract_code_from_ocr_result(self, ocr_result: Dict[str, Any]) -> Dict[str, Any]:
        if 'results' not in ocr_result:
            return ocr_result
        
        enhanced_results = []
        
        for page_result in ocr_result['results']:
            page_blocks = page_result.get('blocks', [])
            enhanced_blocks = []
            
            for block in page_blocks:
                text = block.get('text', '')
                code_blocks = self.detect_code_blocks(text)
                
                if code_blocks:
                    block['code_blocks'] = code_blocks
                    block['has_code'] = True
                else:
                    block['has_code'] = False
                
                enhanced_blocks.append(block)
            
            page_result['blocks'] = enhanced_blocks
            enhanced_results.append(page_result)
        
        ocr_result['results'] = enhanced_results
        ocr_result['code_detection_enabled'] = True
        
        return ocr_result
    
    def format_code_blocks_for_display(self, text: str) -> str:
        code_blocks = self.detect_code_blocks(text)
        
        if not code_blocks:
            return text
        
        lines = text.split('\n')
        result_lines = []
        last_end = -1
        
        for block in sorted(code_blocks, key=lambda x: x['start_line']):
            for i in range(last_end + 1, block['start_line']):
                if i < len(lines):
                    result_lines.append(lines[i])
            
            result_lines.append('```' + (block['language'] if block['language'] != 'unknown' else ''))
            result_lines.extend(block['lines'])
            result_lines.append('```')
            
            last_end = block['end_line']
        
        for i in range(last_end + 1, len(lines)):
            result_lines.append(lines[i])
        
        return '\n'.join(result_lines)

code_block_detector = CodeBlockDetector()
