const ExcelJS = require("exceljs");

const REPORTS = {
  warrantySoon: {
    title: "BÁO CÁO THIẾT BỊ SẮP HẾT BẢO HÀNH",
    filename: "bao_cao_thiet_bi_sap_het_bao_hanh",
    columns: [
      ["TT", 5, "center"], ["Mã TB", 13, "center"], ["Tên thiết bị", 28, "left"],
      ["Khoa", 12, "center"], ["Nhóm", 16, "left"], ["Model", 17, "left"],
      ["Hạn bảo hành", 15, "center"], ["Tình trạng", 18, "center"], ["Ghi chú", 24, "left"]
    ]
  },
  maintenanceOverdue: {
    title: "BÁO CÁO THIẾT BỊ QUÁ HẠN BẢO DƯỠNG",
    filename: "bao_cao_thiet_bi_qua_han_bao_duong",
    columns: [
      ["TT", 5, "center"], ["Mã TB", 13, "center"], ["Tên thiết bị", 28, "left"],
      ["Khoa", 12, "center"], ["Nhóm", 16, "left"], ["Model", 17, "left"],
      ["Hạn bảo dưỡng", 15, "center"], ["Tình trạng", 18, "center"], ["Ghi chú", 24, "left"]
    ]
  },
  inspectionOverdue: {
    title: "BÁO CÁO THIẾT BỊ QUÁ HẠN KIỂM ĐỊNH / HIỆU CHUẨN",
    filename: "bao_cao_thiet_bi_qua_han_kiem_dinh_hieu_chuan",
    columns: [
      ["TT", 5, "center"], ["Mã TB", 13, "center"], ["Tên thiết bị", 28, "left"],
      ["Khoa", 12, "center"], ["Nhóm", 16, "left"], ["Model", 17, "left"],
      ["Hạn kiểm định / hiệu chuẩn", 20, "center"], ["Tình trạng", 18, "center"], ["Ghi chú", 24, "left"]
    ]
  },
  frequentRepairs: {
    title: "BÁO CÁO THIẾT BỊ SỬA CHỮA NHIỀU LẦN",
    filename: "bao_cao_thiet_bi_sua_chua_nhieu_lan",
    columns: [
      ["TT", 5, "center"], ["Mã TB", 13, "center"], ["Tên thiết bị", 28, "left"],
      ["Khoa", 12, "center"], ["Nhóm", 16, "left"], ["Model", 17, "left"],
      ["Số lần sửa", 12, "center"], ["Tổng chi phí", 16, "right"], ["Tình trạng", 18, "center"]
    ]
  },
  costByDepartment: {
    title: "BÁO CÁO CHI PHÍ SỬA CHỮA THEO KHOA/PHÒNG",
    filename: "bao_cao_chi_phi_sua_chua_theo_khoa_phong",
    columns: [
      ["TT", 7, "center"], ["Mã khoa", 15, "center"], ["Khoa/phòng", 34, "left"],
      ["Số phiếu sửa chữa", 20, "center"], ["Tổng chi phí", 22, "right"]
    ]
  },
  replaceList: {
    title: "BÁO CÁO THIẾT BỊ CẦN XEM XÉT THAY THẾ / THANH LÝ",
    filename: "bao_cao_thiet_bi_xem_xet_thay_the_thanh_ly",
    columns: [
      ["TT", 5, "center"], ["Mã TB", 13, "center"], ["Tên thiết bị", 28, "left"],
      ["Khoa", 12, "center"], ["Nhóm", 16, "left"], ["Model", 17, "left"],
      ["Tình trạng", 18, "center"], ["Cấp chất lượng", 14, "center"], ["Số lần sửa", 12, "center"]
    ]
  },
  statusRatio: {
    title: "BÁO CÁO TÌNH TRẠNG TRANG THIẾT BỊ Y TẾ",
    filename: "bao_cao_tinh_trang_trang_thiet_bi_y_te",
    columns: [
      ["TT", 8, "center"], ["Trạng thái", 34, "left"], ["Số lượng", 18, "center"], ["Tỷ lệ", 18, "center"]
    ]
  }
};

function text(v) { return v === null || v === undefined ? "" : String(v); }
function number(v) { const n = Number(v || 0); return Number.isFinite(n) ? n : 0; }
function codeOf(r) { return text(r.device_code || r.insurance_code || (r.id ? `TB-${r.id}` : "")); }
function dateVi(v) {
  const s = text(v).trim().slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}
function todayVi() {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}
function todayFile() {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function dataRows(type, rows) {
  if (type === "costByDepartment") {
    return rows.map((r, i) => [i + 1, text(r.department_code), text(r.department_name || r.department_code), number(r.repair_count), number(r.total_cost)]);
  }
  if (type === "statusRatio") {
    const total = rows.reduce((s, r) => s + number(r.count), 0) || 1;
    return rows.map((r, i) => [i + 1, text(r.status), number(r.count), `${Math.round(number(r.count) * 1000 / total) / 10}%`]);
  }
  if (type === "frequentRepairs") {
    return rows.map((r, i) => [i + 1, codeOf(r), text(r.name), text(r.department_code || r.department_name), text(r.group_name || r.group_code), text(r.model), number(r.repair?.repair_count), number(r.repair?.total_cost), text(r.status)]);
  }
  if (type === "replaceList") {
    return rows.map((r, i) => [i + 1, codeOf(r), text(r.name), text(r.department_code || r.department_name), text(r.group_name || r.group_code), text(r.model), text(r.status), text(r.quality_level), number(r.repair?.repair_count)]);
  }
  const isWarranty = type === "warrantySoon";
  const isMaintenance = type === "maintenanceOverdue";
  return rows.map((r, i) => {
    const relatedDate = isWarranty ? r.warranty_end : isMaintenance ? r.maintenance?.next_date : r.inspection?.next_date;
    return [i + 1, codeOf(r), text(r.name), text(r.department_code || r.department_name), text(r.group_name || r.group_code), text(r.model), dateVi(relatedDate), text(r.status), text(r.note || "")];
  });
}

function applyBorder(cell) {
  cell.border = {
    top: { style: "thin", color: { argb: "FF000000" } },
    left: { style: "thin", color: { argb: "FF000000" } },
    bottom: { style: "thin", color: { argb: "FF000000" } },
    right: { style: "thin", color: { argb: "FF000000" } }
  };
}

function buildWorkbook(type, rows, periodLabel, formCode) {
  const cfg = REPORTS[type];
  if (!cfg) throw new Error("Loại báo cáo không hợp lệ.");

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Bệnh viện Quân y 4";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Bao cao", {
    views: [{ showGridLines: false }],
    pageSetup: {
      orientation: "landscape",
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 }
    }
  });

  const colCount = cfg.columns.length;
  cfg.columns.forEach((c, i) => { sheet.getColumn(i + 1).width = c[1]; });

  const leftEnd = Math.min(4, colCount);
  sheet.mergeCells(1, 1, 1, leftEnd);
  sheet.getCell(1, 1).value = "CỤC HẬU CẦN - KỸ THUẬT QUÂN KHU 4";
  sheet.mergeCells(2, 1, 2, leftEnd);
  sheet.getCell(2, 1).value = "BỆNH VIỆN QUÂN Y 4";

  const codeStart = Math.max(leftEnd + 1, colCount - 2);
  if (codeStart <= colCount) {
    sheet.mergeCells(1, codeStart, 1, colCount);
    sheet.getCell(1, codeStart).value = text(formCode || "BM-BV-TB-02");
    sheet.getCell(1, codeStart).font = { name: "Times New Roman", size: 10, bold: true };
    sheet.getCell(1, codeStart).alignment = { horizontal: "center", vertical: "middle" };
  }

  sheet.mergeCells(4, 1, 4, colCount);
  sheet.getCell(4, 1).value = cfg.title;
  sheet.mergeCells(5, 1, 5, colCount);
  sheet.getCell(5, 1).value = periodLabel || `(Tính đến ngày ${todayVi()})`;

  [sheet.getCell(1, 1), sheet.getCell(2, 1)].forEach((c, idx) => {
    c.font = { name: "Times New Roman", size: 11, bold: true };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  sheet.getCell(4, 1).font = { name: "Times New Roman", size: 14, bold: true };
  sheet.getCell(4, 1).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  sheet.getCell(5, 1).font = { name: "Times New Roman", size: 11, italic: true };
  sheet.getCell(5, 1).alignment = { horizontal: "center", vertical: "middle" };

  sheet.getRow(4).height = 24;
  sheet.getRow(5).height = 20;
  sheet.getRow(7).height = 36;

  cfg.columns.forEach((c, i) => {
    const cell = sheet.getCell(7, i + 1);
    cell.value = c[0];
    cell.font = { name: "Times New Roman", size: 10, bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    applyBorder(cell);
  });

  const rowsData = dataRows(type, Array.isArray(rows) ? rows : []);
  rowsData.forEach((values, index) => {
    const rowNo = 8 + index;
    const row = sheet.getRow(rowNo);
    values.forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = v;
      cell.font = { name: "Times New Roman", size: 10 };
      const align = cfg.columns[ci]?.[2] || "left";
      cell.alignment = { horizontal: align, vertical: "top", wrapText: true };
      applyBorder(cell);
      if ((type === "frequentRepairs" && ci === 7) || (type === "costByDepartment" && ci === 4)) {
        cell.numFmt = "#,##0";
      }
    });
    row.height = 30;
  });

  const lastDataRow = Math.max(8, 7 + rowsData.length);
  if (!rowsData.length) {
    sheet.mergeCells(8, 1, 8, colCount);
    const empty = sheet.getCell(8, 1);
    empty.value = "Chưa có dữ liệu.";
    empty.font = { name: "Times New Roman", size: 10, italic: true };
    empty.alignment = { horizontal: "center", vertical: "middle" };
    applyBorder(empty);
    sheet.getRow(8).height = 28;
  }

  const signRow = lastDataRow + 3;
  const mid = Math.max(1, Math.floor(colCount / 2));
  sheet.mergeCells(signRow, 1, signRow, mid);
  sheet.getCell(signRow, 1).value = "NGƯỜI LẬP";
  sheet.getCell(signRow, 1).font = { name: "Times New Roman", size: 11, bold: true };
  sheet.getCell(signRow, 1).alignment = { horizontal: "center", vertical: "middle" };

  if (mid + 1 <= colCount) {
    sheet.mergeCells(signRow, mid + 1, signRow, colCount);
    sheet.getCell(signRow, mid + 1).value = "KHOA TRANG BỊ";
    sheet.getCell(signRow, mid + 1).font = { name: "Times New Roman", size: 11, bold: true };
    sheet.getCell(signRow, mid + 1).alignment = { horizontal: "center", vertical: "middle" };
  }

  sheet.pageSetup.printArea = `A1:${sheet.getColumn(colCount).letter}${signRow + 4}`;
  return { workbook, filename: `${cfg.filename}_${todayFile()}.xlsx` };
}

module.exports = function registerReportExportRoutes(app) {
  app.post("/api/reports/export-xlsx", async (req, res) => {
    try {
      const type = text(req.body?.type);
      const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
      const periodLabel = text(req.body?.period_label);
      const formCode = text(req.body?.form_code || "BM-BV-TB-02");
      const { workbook, filename } = buildWorkbook(type, rows, periodLabel, formCode);
      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(Buffer.from(buffer));
    } catch (e) {
      console.error("POST /api/reports/export-xlsx error:", e);
      res.status(500).json({ error: e.message || "Không xuất được báo cáo Excel." });
    }
  });
};
