import { useState, useCallback } from 'react';
import { PhilosophyKeyword, PhilosophyKeywordMatch, ParsedKeyword } from '../types';
import philosophyData from '../../philosophy-data.json';

function parseKeyword(keyword: string): ParsedKeyword {
  const patterns = [
    { regex: /(.+?)\s*对立于\s*(.+)/, connector: '对立于' },
    { regex: /(.+?)\s*调和者[：:]\s*(.+?)\s+(.+)/, connector: '调和者' },
    { regex: /(.+?)\s*调和者[：:]\s*(.+)/, connector: '调和者' },
  ];

  for (const pattern of patterns) {
    const match = keyword.match(pattern.regex);
    if (match) {
      if (pattern.connector === '调和者' && match[3]) {
        return {
          left: match[1].trim(),
          right: match[3].trim(),
          connector: `调和者：${match[2].trim()}`,
        };
      }
      return {
        left: match[1].trim(),
        right: match[2]?.trim(),
        connector: pattern.connector,
      };
    }
  }

  return { left: keyword };
}

function parseKeywords(keywords: string[]): ParsedKeyword[] {
  return keywords.map(parseKeyword);
}

function extractCodeFromTitle(title: string): string | null {
  const codePattern = /^(\d+-\d+-\d+-\d+)/;
  const match = title.match(codePattern);
  return match ? match[1] : null;
}

export function usePhilosophyKeywords() {
  const [highlightedKeyword, setHighlightedKeyword] = useState<string | null>(null);
  const philosophyKeywords = philosophyData as PhilosophyKeyword[];

  const findMatchingPhilosophyKeywords = useCallback((title: string): PhilosophyKeywordMatch[] => {
    const code = extractCodeFromTitle(title);
    if (!code) return [];

    const matches: PhilosophyKeywordMatch[] = [];
    
    philosophyKeywords.forEach((item) => {
      if (item.code.startsWith(code)) {
        matches.push({
          code: item.code,
          name: item.name,
          keywords: {
            field: item.field,
            ontology: parseKeywords(item.ontology || []),
            epistemology: parseKeywords(item.epistemology || []),
            teleology: parseKeywords(item.teleology || []),
          },
        });
      }
    });

    return matches;
  }, [philosophyKeywords]);

  const handleKeywordClick = useCallback((keyword: string) => {
    setHighlightedKeyword(keyword);
    setTimeout(() => {
      setHighlightedKeyword(null);
    }, 3000);
  }, []);

  return {
    highlightedKeyword,
    setHighlightedKeyword,
    philosophyKeywords,
    findMatchingPhilosophyKeywords,
    handleKeywordClick,
  };
}
