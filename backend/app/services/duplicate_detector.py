import hashlib
import fitz
import re
from difflib import SequenceMatcher
from typing import Optional, Dict, List, Tuple
from pathlib import Path


class DuplicateDetector:
    SIMHASH_BITS = 64
    MURMUR_SEED = 0x1B873593

    def calculate_file_hash(self, file_path: str) -> str:
        sha256_hash = hashlib.sha256()

        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                sha256_hash.update(chunk)

        return sha256_hash.hexdigest()

    def calculate_content_hash(
        self, file_path: str, sample_pages: int = 100
    ) -> Tuple[str, int]:
        with fitz.open(file_path) as doc:
            total_pages = len(doc)

            if total_pages == 0:
                return "0" * 32, 0

            pages_to_sample = min(sample_pages, total_pages)
            step = max(1, total_pages // pages_to_sample) if pages_to_sample > 0 else 1

            text_content = ""
            for i in range(0, total_pages, step):
                page = doc[i]
                text_content += page.get_text()

        return self._simhash_text(text_content), len(text_content)

    def _simhash_text(self, text: str) -> str:
        if not text:
            return "0" * 32

        text = text.lower()
        text = re.sub(r"[^\w\s]", "", text)

        tokens = text.split()
        if not tokens:
            return "0" * 32

        v = [0] * self.SIMHASH_BITS

        for token in tokens[:10000]:
            for i in range(self.SIMHASH_BITS):
                bitmask = 1 << i
                if hash(token) & bitmask:
                    v[i] += 1
                else:
                    v[i] -= 1

        fingerprint = 0
        for i in range(self.SIMHASH_BITS):
            if v[i] >= 0:
                fingerprint |= 1 << i

        return format(fingerprint, "08x")

    def calculate_murmur_hash(self, file_path: str) -> str:
        with fitz.open(file_path) as doc:
            text_content = ""

            for page in doc:
                text_content += page.get_text()

        if not text_content:
            return "0" * 32

        return self._murmurhash3(text_content.encode("utf-8", errors="ignore"))

    def _murmurhash3(self, data: bytes) -> str:
        h = self.MURMUR_SEED

        c1 = 0xCC9E2D51
        c2 = 0x1B873593

        length = len(data)
        nblocks = length // 4

        for i in range(nblocks):
            k1 = (
                data[i * 4]
                | (data[i * 4 + 1] << 8)
                | (data[i * 4 + 2] << 16)
                | (data[i * 4 + 3] << 24)
            )
            k1 = c1 * k1
            k1 = self._rotl32(k1, 15)
            k1 = c2 * k1
            h ^= k1
            h = self._rotl32(h, 13)
            h = h * 5 + 0xE6546B64

        tail = data[nblocks * 4 :]
        tail_size = length & 3

        k1 = 0

        for i in range(tail_size):
            k1 |= tail[i] << (i * 8)

        k1 = c1 * k1
        k1 = self._rotl32(k1, 15)
        k1 = c2 * k1
        h ^= k1

        h ^= length
        h ^= h >> 16
        h ^= h >> 13
        h ^= h >> 16

        h &= 0xFFFFFFFF

        return format(h, "08x")

    def _rotl32(self, x: int, r: int) -> int:
        return ((x << r) | (x >> (32 - r))) & 0xFFFFFFFF

    def get_page_count(self, file_path: str) -> int:
        with fitz.open(file_path) as doc:
            page_count = len(doc)
        return page_count

    def extract_title_variants(self, title: str) -> List[str]:
        variants = [title]

        variants.append(title.lower())
        variants.append(title.upper())
        variants.append(title.title())

        clean_title = re.sub(r"[^\w\s]", "", title)
        if clean_title != title:
            variants.append(clean_title)
            variants.append(clean_title.lower())

        patterns = [
            r"第[一二三四五六七八九十\d]+[点册章节部]",
            r"卷[一二三四五六七八九十\d]+",
            r"[上下]",
            r"[（(].*[）)]",
        ]

        for pattern in patterns:
            match = re.search(pattern, title)
            if match:
                base = re.sub(pattern, "", title).strip()
                if base:
                    variants.append(base)
                    variants.append(base.lower())

        return list(set(variants))

    def calculate_similarity(self, text1: str, text2: str) -> float:
        if not text1 or not text2:
            return 0.0

        matcher = SequenceMatcher(None, text1, text2)
        return matcher.ratio()

    def compare_metadata(
        self,
        title1: str,
        title2: str,
        author1: Optional[str] = None,
        author2: Optional[str] = None,
        page_count1: Optional[int] = None,
        page_count2: Optional[int] = None,
    ) -> Dict:
        result = {
            "title_match": False,
            "title_similarity": 0.0,
            "author_match": False,
            "page_count_match": False,
            "overall_score": 0.0,
        }

        title_variants1 = self.extract_title_variants(title1)
        title_variants2 = self.extract_title_variants(title2)

        for v1 in title_variants1:
            for v2 in title_variants2:
                if v1 == v2:
                    result["title_match"] = True
                    break
            if result["title_match"]:
                break

        if not result["title_match"]:
            result["title_similarity"] = self.calculate_similarity(title1, title2)

        if author1 and author2:
            if author1.strip() == author2.strip():
                result["author_match"] = True
            else:
                author_sim = self.calculate_similarity(author1, author2)
                result["author_match"] = author_sim > 0.85

        if page_count1 and page_count2:
            result["page_count_match"] = page_count1 == page_count2

        score = 0.0
        if result["title_match"]:
            score += 0.5
        elif result["title_similarity"] > 0.8:
            score += 0.4
        elif result["title_similarity"] > 0.6:
            score += 0.3

        if result["author_match"]:
            score += 0.3

        if result["page_count_match"]:
            score += 0.2

        result["overall_score"] = min(score, 1.0)

        return result


class DuplicateCheckResult:
    def __init__(
        self,
        is_duplicate: bool,
        duplicate_type: str,
        existing_book_id: Optional[str] = None,
        existing_book_title: Optional[str] = None,
        similarity_score: float = 0.0,
        details: Optional[Dict] = None,
    ):
        self.is_duplicate = is_duplicate
        self.duplicate_type = duplicate_type
        self.existing_book_id = existing_book_id
        self.existing_book_title = existing_book_title
        self.similarity_score = similarity_score
        self.details = details or {}

    def to_dict(self):
        return {
            "is_duplicate": self.is_duplicate,
            "duplicate_type": self.duplicate_type,
            "existing_book_id": self.existing_book_id,
            "existing_book_title": self.existing_book_title,
            "similarity_score": self.similarity_score,
            "details": self.details,
        }


duplicate_detector = DuplicateDetector()
