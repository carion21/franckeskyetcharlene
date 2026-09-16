/**
 * CSV writer for the backoffice export (/admin/export.csv).
 *
 * Small on purpose: one function, no dependency. The whole point is to be
 * the single place where the three things that make a CSV go wrong are
 * handled — the separator, the quoting, and the formula injection.
 */

/**
 * Semicolon, not comma.
 *
 * The file is opened in Excel on a French locale, where the list separator is
 * `;`. A comma-separated file lands there as a single column per row, and the
 * organiser's reaction to that is not "wrong separator" but "the export is
 * broken". LibreOffice and Google Sheets both read `;` without complaint.
 */
var SEPARATOR = ';';

// CRLF: what the CSV RFC asks for, and what the older spreadsheet builds on
// Windows still expect.
var EOL = '\r\n';

/**
 * A leading =, +, -, @ (and the tab/CR that some parsers strip back into one)
 * makes a spreadsheet read the cell as a formula. A guest named by someone
 * with a taste for mischief — or a pasted `=HYPERLINK(...)` — then executes
 * on open. Prefixing with an apostrophe forces the cell to text; the
 * apostrophe itself is not displayed by Excel.
 *
 * This matters here specifically because every field in the export came from
 * a public form (PRD §4.2): none of it is trusted input.
 */
var RISKY_FIRST_CHAR = /^[=+\-@\t\r]/;

function escapeCell(value) {
  var text = value === null || value === undefined ? '' : String(value);

  if (RISKY_FIRST_CHAR.test(text)) text = "'" + text;

  // Quote as soon as the cell contains anything that would otherwise end the
  // field or the line; doubling the quote is how CSV escapes a quote.
  if (/["\r\n;,\t]/.test(text)) {
    text = '"' + text.replace(/"/g, '""') + '"';
  }

  return text;
}

/**
 * @param {string[]} headers      column titles, in order
 * @param {Array<Array>} rows     one array of cells per line, same order
 * @returns {string} the complete file contents, BOM included
 */
function build(headers, rows) {
  var lines = [headers].concat(rows).map(function (cells) {
    return cells.map(escapeCell).join(SEPARATOR);
  });

  // The BOM is what tells Excel the file is UTF-8. Without it, it falls back
  // to a legacy code page and every accented name arrives mangled — "Anaïs"
  // as "AnaÃ¯s". Other tools ignore it.
  return '\uFEFF' + lines.join(EOL) + EOL;
}

module.exports = {
  build: build,
  SEPARATOR: SEPARATOR
};
