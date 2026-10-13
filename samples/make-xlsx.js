// Builds products-sample.xlsx from products-sample.csv (URLs written as hyperlink cells).
const fs = require('node:fs');
const path = require('node:path');
const ExcelJS = require('exceljs');
const Papa = require('papaparse');

const csv = fs.readFileSync(path.join(__dirname, 'products-sample.csv'), 'utf8');
const { data } = Papa.parse(csv.trim());

const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet('Products');
data.forEach((row, i) => {
  const r = ws.addRow(row);
  if (i > 0 && /^https?:\/\//.test(row[1] ?? '')) r.getCell(2).value = { text: row[1], hyperlink: row[1] };
});
ws.getRow(1).font = { bold: true };
wb.xlsx.writeFile(path.join(__dirname, 'products-sample.xlsx')).then(() => console.log('wrote products-sample.xlsx'));
