#!/usr/bin/env python3
"""
Invoice PDF extraction — Varuna AeroTech tax invoice format.
Handles both IGST (inter-state) and CGST+SGST (intra-state) invoices.
"""
import sys, json, re, io, os

# Force UTF-8 output on Windows (cp1252 can't encode ₹)
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# Tesseract path on Windows
for _p in [r"C:\Program Files\Tesseract-OCR\tesseract.exe",
           r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe"]:
    if os.path.exists(_p):
        try:
            import pytesseract
            pytesseract.pytesseract.tesseract_cmd = _p
        except ImportError:
            pass
        break

MONTHS = {"jan":"01","feb":"02","mar":"03","apr":"04","may":"05","jun":"06",
          "jul":"07","aug":"08","sep":"09","oct":"10","nov":"11","dec":"12"}

# ── Helpers ────────────────────────────────────────────────────────────────────
def clean_num(s):
    if s is None: return None
    s = re.sub(r"[,\s₹$₹]", "", str(s).strip())
    if not s: return None
    try:    return float(s)
    except: return None

def parse_date(s):
    if not s: return None
    s = s.strip()
    m = re.match(r"(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{4})", s)
    if m:
        mo = MONTHS.get(m.group(2).lower())
        if mo: return f"{m.group(3)}-{mo}-{m.group(1).zfill(2)}"
    m = re.match(r"(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})", s)
    if m: return f"{m.group(3)}-{m.group(2).zfill(2)}-{m.group(1).zfill(2)}"
    return s

def first(text, patterns):
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE | re.MULTILINE)
        if m: return (m.group(1) if m.lastindex else m.group(0)).strip()
    return None

def norm_desc(s):
    """Collapse newlines/whitespace in a description fragment."""
    if not s: return ""
    return re.sub(r"\s+", " ", str(s).replace("\n", " ")).strip()

def join_desc(base, extra):
    """Append a wrapped description fragment to an existing description."""
    base, extra = norm_desc(base), norm_desc(extra)
    if not extra: return base
    if not base:  return extra
    return f"{base} {extra}"

def safe_nums(text):
    """Extract numbers from text, skipping 6-digit HSN codes."""
    text = re.sub(r'\b\d{6}\b', ' ', text)           # remove HSN/SAC codes
    result = []
    for n in re.findall(r'\d[\d,]*\.?\d*', text):
        v = clean_num(n)
        if v is not None and v > 0:
            result.append(v)
    return result

# ── Extract header fields ──────────────────────────────────────────────────────
def extract_fields(text):
    t = re.sub(r"[ \t]+", " ", text.replace("\r", ""))

    inv_num = first(t, [
        r"Invoice\s+No\.?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-/]{1,20})",
        r"\b([A-Z]{2,6}-\d{1,6})\b",
    ])

    date_raw = first(t, [
        r"Invoice\s+Date\s*[:\-]?\s*(\d{1,2}[-\s][A-Za-z]{3}[-\s]\d{4})",
        r"Invoice\s+Date\s*[:\-]?\s*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{4})",
        r"\b(\d{2}[-\s][A-Za-z]{3}[-\s]\d{4})\b",
        r"\b(\d{2}[/\-.]\d{2}[/\-.]\d{4})\b",
    ])
    inv_date = parse_date(date_raw)

    # Vendor: "For <Company>" at start of line (not "ORIGINAL FOR RECIPIENT")
    vendor = first(t, [r"^For\s+([A-Za-z][A-Za-z0-9 &.,\-]{2,60})\s*$"])
    if vendor: vendor = vendor.strip().rstrip(".,")

    # Buyer: "M/S <Company>" — stop at double-space, tab, or date/detail keywords
    buyer_raw = first(t, [r"M/S\s+([A-Za-z][A-Za-z0-9 &.,\-]{3,80})"])
    buyer = None
    if buyer_raw:
        buyer = re.split(
            r"\s{2,}|\t|P\.O\.|(?:Due\s+Date|Invoice\s+Date|Address|Phone|GSTIN|PAN)\b",
            buyer_raw
        )[0].strip().rstrip(".,")

    # Vendor GSTIN has "GSTIN :" (with colon) in the header
    vgstin_m = re.search(r"GSTIN\s*:\s*([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z])", t, re.I)
    vendor_gstin = vgstin_m.group(1).upper() if vgstin_m else None

    # Buyer GSTIN: first GSTIN that isn't the vendor's
    all_gstins = re.findall(r"\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z])\b", t)
    buyer_gstin = next((g.upper() for g in all_gstins if g.upper() != vendor_gstin), None)

    def amt(patterns):
        return clean_num(first(t, patterns))

    total_amount = amt([
        r"Total\s+Amount\s+After\s+Tax\s*[:\-]?\s*(?:₹|₹)?\s*([\d,]+\.?\d{0,2})",
        r"(?:Grand\s+Total|Net\s+Payable|Amount\s+Payable)\s*[:\-]?\s*(?:₹|₹)?\s*([\d,]+\.?\d{0,2})",
    ])
    subtotal = amt([
        r"Taxable\s+Amount\s*[:\-]?\s*([\d,]+\.?\d{0,2})",
        r"Taxable\s+Value\s*(?:Total)?\s*[:\-]?\s*([\d,]+\.?\d{0,2})",
    ])
    tax_amount = amt([
        r"Total\s+Tax\s*[:\-]?\s*([\d,]+\.?\d{0,2})",
        r"(?:Add\s*[:\-]?\s*)?(?:Total\s+)?IGST\s*[:\-]?\s*([\d,]+\.?\d{0,2})",
    ])

    return {
        "invoice_number": inv_num,
        "invoice_date":   inv_date,
        "vendor_name":    vendor,
        "vendor_gstin":   vendor_gstin,
        "buyer_name":     buyer,
        "buyer_gstin":    buyer_gstin,
        "total_amount":   total_amount,
        "subtotal":       subtotal,
        "tax_amount":     tax_amount,
    }

# ── Line item extraction — only parses the table section ──────────────────────
def extract_items(text):
    """
    Finds the table between the column-header row and the 'Total' footer.
    Only rows starting with a serial number (1, 2, …) are treated as items.
    """
    lines = text.replace("\r", "").split("\n")

    # ── Locate table boundaries ────────────────────────────────────────────────
    table_start = None
    table_end   = len(lines)

    for i, line in enumerate(lines):
        s = line.strip()
        if re.search(r"(?:Sr\.?\s*No|Name\s+of\s+Product|HSN\s*/?\s*SAC)", s, re.I):
            table_start = i + 1
        if table_start and re.match(r"^Total\b", s, re.I) and not re.search(
                r"(?:Amount|Tax|Words|in\s+words)", s, re.I):
            table_end = i
            break

    if table_start is None:
        return []

    table_lines = [l.strip() for l in lines[table_start:table_end] if l.strip()]

    # ── Parse rows ─────────────────────────────────────────────────────────────
    items      = []
    cur_desc   = None
    cur_nums   = []
    cur_unit   = None

    SKIP = re.compile(
        r"^(?:%\s+Amount|CGST|SGST|IGST|HSN|SAC|Sr\.?\s*No|"
        r"Total|Taxable|Bank|Certified|Authorised|Subject|For\s+Varuna|"
        r"Pay\s+using|Name\s+ICICI|Branch|Acc\.|IFSC|UPI)",
        re.I)

    def flush():
        if cur_desc and cur_nums:
            items.append(build_item(cur_desc, cur_nums, cur_unit))

    for line in table_lines:
        if not line or SKIP.match(line):
            continue

        # New item: line starts with a serial number
        m = re.match(r"^(\d{1,3})\s+(.+)$", line)
        if m:
            flush()
            rest = m.group(2).strip()

            # Split off description from the numerical part
            # HSN code is 6 digits; description is everything before it
            hsn_m = re.search(r"\s+(\d{6})\s+", rest)
            if hsn_m:
                cur_desc = rest[:hsn_m.start()].strip()
                nums_part = rest[hsn_m.end():].strip()
            else:
                # No HSN — description before first big number (>=100)
                big_num = re.search(r"\s+\d[\d,]{2,}", rest)
                if big_num:
                    cur_desc = rest[:big_num.start()].strip()
                    nums_part = rest[big_num.start():].strip()
                else:
                    cur_desc = rest
                    nums_part = ""

            cur_nums = safe_nums(nums_part)
            # Extract unit  e.g. "15.0 DAY" or "1.0 UNT"
            u = re.search(r"\b(\d+\.?\d*)\s+([A-Z]{2,4})\b", nums_part)
            cur_unit = u.group(2) if u else None

        elif cur_desc is not None:
            # Continuation line — could be more description or a numbers-only row
            only_alpha = re.sub(r"\d[\d,]*\.?\d*", "", line).strip()
            only_alpha = re.sub(r"[^\w]", "", only_alpha)

            if not only_alpha:
                # Pure numbers row (sometimes numbers appear on a separate line)
                extra = safe_nums(line)
                if extra and not cur_nums:
                    cur_nums = extra
            elif re.match(r"[A-Za-z]", line):
                # Description continuation (e.g. "2 MW at Saint Gobain India").
                # No length cap: a wrapped description line can be long, and the old
                # 80-char limit silently dropped the rest of the description. Footer
                # noise is already excluded by SKIP and the table_end boundary.
                cur_desc = join_desc(cur_desc, line)

    flush()
    return items


def build_item(desc, nums, unit=None):
    """
    Map positional numbers to fields.
    IGST format:       [qty, rate, taxable, igst_pct, igst_amt, total]
    CGST+SGST format:  [qty, rate, taxable, cgst_pct, cgst_amt, sgst_pct, sgst_amt, total]
    """
    total    = nums[-1] if nums else None
    qty      = nums[0]  if len(nums) >= 1 else None
    rate     = nums[1]  if len(nums) >= 2 else None
    taxable  = nums[2]  if len(nums) >= 3 else None

    tax_pct = None; tax_amt = None
    if len(nums) >= 6:
        if len(nums) >= 8:
            # CGST + SGST: indices 3=cgst%, 4=cgst_amt, 5=sgst%, 6=sgst_amt
            p1, a1 = nums[3], nums[4]
            p2, a2 = nums[5], nums[6]
            if p1 < 50 and p2 < 50:
                tax_pct = p1 + p2
                tax_amt = a1 + a2
        else:
            # IGST: indices 3=pct, 4=amt
            if nums[3] < 100:
                tax_pct = nums[3]
                tax_amt = nums[4] if len(nums) >= 6 else None

    return {
        "description":   norm_desc(desc),
        "qty":           qty,
        "unit":          unit,
        "rate":          rate,
        "taxable_value": taxable,
        "tax_percent":   tax_pct,
        "tax_amount":    tax_amt,
        "amount":        total,
    }

# ── Row reconstruction from word geometry ─────────────────────────────────────
# Varuna invoices draw no horizontal rule between item rows, so pdfplumber sees
# every item as ONE row whose cells each hold the stacked values of all items
# ("17,700.00\n11,800.00\n5,900.00"). The y-position of each word is the only
# thing that says which item a value belongs to, so rows are rebuilt from that.
Y_TOL = 4.0   # points; words within this of each other are on the same line

def cell_lines(page, bbox):
    """[(top, text)] for one cell, one entry per visual line, top to bottom."""
    if not bbox:
        return []
    x0, top, x1, bottom = bbox
    px0, ptop, px1, pbottom = page.bbox
    box = (max(x0 + 0.5, px0), max(top + 0.5, ptop),
           min(x1 - 0.5, px1), min(bottom - 0.5, pbottom))
    if box[0] >= box[2] or box[1] >= box[3]:
        return []
    try:
        words = page.crop(box).extract_words()
    except Exception:
        return []

    lines = []   # [[top, [texts]]]
    for w in sorted(words, key=lambda w: (w["top"], w["x0"])):
        if lines and abs(w["top"] - lines[-1][0]) <= Y_TOL:
            lines[-1][1].append(w["text"])
        else:
            lines.append([w["top"], [w["text"]]])
    return [(t, " ".join(parts)) for t, parts in lines]


def split_row(page, row_cells, row_text, anchor_i):
    """
    Split one table row into the logical item rows it actually contains.
    Returns [{col_index: text}] — one dict per item.

    The anchor column (the money column) carries exactly one value per item, so
    its line tops define each item's band. Every other column's lines are then
    assigned to the band they fall in, which keeps a wrapped description line
    ("Hyundai Motors_9.5MW site") attached to the item above it.
    """
    plain = {i: str(c or "").strip() for i, c in enumerate(row_text)}

    if anchor_i is None or anchor_i >= len(row_cells):
        return [plain]
    anchors = [t for t, _ in cell_lines(page, row_cells[anchor_i])]
    if len(anchors) < 2:
        return [plain]          # ordinary single-item row — nothing to split

    def band_of(top):
        idx = 0
        for i, a in enumerate(anchors):
            if top + Y_TOL >= a:
                idx = i
        return idx

    records = [{} for _ in anchors]
    for ci, bbox in enumerate(row_cells):
        for top, text in cell_lines(page, bbox):
            b = records[band_of(top)]
            b[ci] = f"{b[ci]} {text}".strip() if ci in b else text
    return records


# ── pdfplumber table extraction (primary attempt) ─────────────────────────────
def extract_items_plumber(pdf_bytes):
    try:
        import pdfplumber
        items = []
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages[:6]:
                for tbl_obj in page.find_tables():
                    tbl = tbl_obj.extract()
                    if not tbl or len(tbl) < 2:
                        continue
                    # Find the invoice items table (has Sr.No + product columns)
                    hdr_idx = None
                    for ri, row in enumerate(tbl):
                        rtext = " ".join(str(c or "").lower() for c in row)
                        if re.search(r"sr\.?\s*no|name\s+of\s+product|hsn|qty|taxable", rtext):
                            hdr_idx = ri
                            break
                    if hdr_idx is None:
                        continue

                    header = [str(c or "").lower().strip() for c in tbl[hdr_idx]]
                    data_start = hdr_idx + 1

                    # Two-row header: "IGST" (or "CGST"/"SGST") spans a "%" / "Amount"
                    # pair on the row beneath it. Fold that sub-row in — carrying the
                    # group label across the columns it spans — so the tax columns are
                    # identifiable as "igst %" / "igst amount" rather than bare "%".
                    if hdr_idx + 1 < len(tbl):
                        sub = [str(c or "").lower().strip() for c in tbl[hdr_idx + 1]]
                        if any(s in ("%", "amount") for s in sub) and \
                           not any(re.search(r"\d", s) for s in sub):
                            merged, group = [], ""
                            for i, h in enumerate(header):
                                if h: group = h
                                leaf = sub[i] if i < len(sub) else ""
                                merged.append(f"{group} {leaf}".strip() if leaf else h)
                            header = merged
                            data_start = hdr_idx + 2

                    def cidx(*keys):
                        for k in keys:
                            for i, h in enumerate(header):
                                if k in h: return i
                        return None

                    desc_i  = cidx("name", "product", "service", "particular", "description")
                    qty_i   = cidx("qty", "quantity")
                    rate_i  = cidx("rate")
                    tv_i    = cidx("taxable")
                    # "total" column is the LAST column whose header contains "total" or "amount"
                    amt_i   = None
                    for i in range(len(header)-1, -1, -1):
                        if "total" in header[i] or header[i] == "amount":
                            amt_i = i; break
                    if amt_i is None: amt_i = len(header) - 1

                    SKIP_DESC = re.compile(
                        r"^(?:total|grand|sub\s*total|taxable\s*amount|add\s*:|bank|"
                        r"certified|authorised|subject|for\s+varuna|name\s+icici|"
                        r"pay\s+using|branch|acc|ifsc|upi|\d+$)",
                        re.I)

                    cgst_i   = cidx("cgst amount", "cgst\namount")
                    sgst_i   = cidx("sgst amount", "sgst\namount")
                    igst_i   = cidx("igst amount", "igst\namount")
                    cgst_p_i = cidx("cgst\n%", "cgst %")
                    igst_p_i = cidx("igst\n%", "igst %")

                    for ri in range(data_start, len(tbl)):
                        row = tbl[ri]
                        if not row or not any(row): continue
                        row_cells = tbl_obj.rows[ri].cells if ri < len(tbl_obj.rows) else []

                        for rec in split_row(page, row_cells, row, amt_i):
                            def cell(i, _rec=rec):
                                if i is None: return ""
                                return str(_rec.get(i) or "").strip()

                            desc = cell(desc_i) if desc_i is not None else ""
                            if not desc or SKIP_DESC.match(desc): continue

                            total_val = clean_num(cell(amt_i))
                            if total_val is None:
                                # Description-only row: the description wrapped onto a row
                                # carrying no amount. Append it to the previous item rather
                                # than dropping it, so the full description is captured.
                                if items:
                                    items[-1]["description"] = join_desc(
                                        items[-1]["description"], desc)
                                continue

                            qm    = re.match(r"([\d,]+\.?\d*)\s*([A-Z]*)", cell(qty_i))
                            qty   = clean_num(qm.group(1)) if qm else None
                            unit  = (qm.group(2).strip() or None) if qm else None

                            # tax_amount = CGST_amt + SGST_amt if both present, else IGST_amt
                            tax_pct = None; tax_amt = None
                            if cgst_i is not None and sgst_i is not None:
                                ca = clean_num(cell(cgst_i)); sa = clean_num(cell(sgst_i))
                                if ca is not None and sa is not None: tax_amt = ca + sa
                                cp = clean_num(cell(cgst_p_i)) if cgst_p_i is not None else None
                                if cp: tax_pct = cp * 2
                            elif igst_i is not None:
                                tax_amt = clean_num(cell(igst_i))
                                if igst_p_i is not None: tax_pct = clean_num(cell(igst_p_i))

                            items.append({
                                "description":   norm_desc(desc),
                                "qty":           qty,
                                "unit":          unit,
                                "rate":          clean_num(cell(rate_i)),
                                "taxable_value": clean_num(cell(tv_i)),
                                "tax_percent":   tax_pct,
                                "tax_amount":    tax_amt,
                                "amount":        total_val,
                            })
        return items
    except Exception as e:
        print(f"[plumber] {e}", file=sys.stderr)
        return []

# ── Main pipeline ──────────────────────────────────────────────────────────────
def extract(pdf_path):
    with open(pdf_path, "rb") as f:
        pdf_bytes = f.read()

    text = ""; method = "none"

    # Stage 1: PyMuPDF
    try:
        import fitz
        doc   = fitz.open(stream=pdf_bytes, filetype="pdf")
        pages = "\n".join(page.get_text() for page in doc)
        if len(pages.strip()) > 80:
            text = pages; method = "text-layer-pymupdf"
    except Exception as e:
        print(f"[pymupdf] {e}", file=sys.stderr)

    # Stage 2: pdfplumber text
    if len(text) < 80:
        try:
            import pdfplumber
            with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
                pages = "\n".join(p.extract_text() or "" for p in pdf.pages[:10])
            if len(pages.strip()) > 80:
                text = pages; method = "text-layer-pdfplumber"
        except Exception as e:
            print(f"[pdfplumber text] {e}", file=sys.stderr)

    # Stage 3: OCR fallback
    if len(text) < 80:
        try:
            import fitz, pytesseract
            from PIL import Image
            doc   = fitz.open(stream=pdf_bytes, filetype="pdf")
            pages = []
            for page in list(doc)[:6]:
                pix = page.get_pixmap(matrix=fitz.Matrix(2.5, 2.5))
                img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                pages.append(pytesseract.image_to_string(img, lang="eng"))
            t = "\n\n".join(pages).strip()
            if t: text = t; method = "ocr"
        except Exception as e:
            print(f"[ocr] {e}", file=sys.stderr)

    fields = extract_fields(text) if text else {}

    # Line items: pdfplumber table first (most accurate), then targeted text fallback
    items = extract_items_plumber(pdf_bytes)
    if not items and text:
        items = extract_items(text)

    has_data = any(v is not None for v in fields.values())
    status   = "none" if not text else ("ok" if has_data else "no_match")

    return {
        "fields":            fields,
        "items":             items,
        "raw_text":          text[:6000] if text else None,
        "extraction_status": status,
        "extraction_method": method,
    }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No PDF path provided"})); sys.exit(1)
    try:
        result = extract(sys.argv[1])
        print(json.dumps(result, ensure_ascii=False, default=str))
    except Exception as e:
        import traceback
        print(json.dumps({"error": str(e), "trace": traceback.format_exc()[-800:]}))
        sys.exit(1)
