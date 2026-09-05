// Hoàn thiện luồng Sự cố -> Sửa chữa mà không thay đổi dữ liệu chính hiện có.
(function () {
  const page = String(window.location.pathname || "").toLowerCase();
  const el = (id) => document.getElementById(id);

  function removeLegacyUserBox() {
    document.querySelectorAll(".user-box").forEach(node => node.remove());
  }

  if (page.endsWith("/tickets.html") || page.endsWith("/tickets")) {
    if (typeof window.resetIncidentForm === "function") {
      const originalResetIncidentForm = window.resetIncidentForm;
      window.resetIncidentForm = function () {
        originalResetIncidentForm();
        // Người ghi nhận phải là người thực tế, không tự gán "Quản trị viên".
        if (el("reporter") && !el("incidentId")?.value) el("reporter").value = "";
      };
    }

    document.addEventListener("DOMContentLoaded", () => {
      removeLegacyUserBox();
      if (el("pageSubtitle")) el("pageSubtitle").textContent = "Tiếp nhận, theo dõi và xử lý sự cố thiết bị";
    });
    return;
  }

  if (!(page.endsWith("/maintenance.html") || page.endsWith("/maintenance"))) return;

  const STANDARD_METHODS = ["Nội bộ", "Bảo hành", "Thuê ngoài"];
  let CONTEXTS = new Map();

  function setStandardMethods(select, currentValue = "") {
    if (!select) return;
    const values = [...STANDARD_METHODS];
    if (currentValue && !values.includes(currentValue)) values.push(currentValue);
    select.innerHTML = values.map(v => `<option value="${String(v).replace(/"/g, "&quot;")}">${v}</option>`).join("");
    select.value = currentValue && values.includes(currentValue) ? currentValue : STANDARD_METHODS[0];
  }

  function currentContextPayload() {
    return {
      priority: String(el("priority")?.value || "Bình thường").trim(),
      reporter: String(el("reporter")?.value || "").trim(),
      note: String(el("note")?.value || "").trim()
    };
  }

  const originalApi = window.api;
  if (typeof originalApi === "function") {
    window.api = async function (url, options = {}) {
      const result = await originalApi(url, options);
      try {
        const method = String(options?.method || "GET").toUpperCase();
        let repairId = 0;
        if (url === "/api/repairs" && method === "POST") repairId = Number(result?.id || 0);
        const match = String(url).match(/^\/api\/repairs\/(\d+)$/);
        if (match && method === "PUT") repairId = Number(match[1]);
        if (repairId) {
          await originalApi(`/api/repairs/${repairId}/context`, {
            method: "PUT",
            body: JSON.stringify(currentContextPayload())
          });
        }
      } catch (error) {
        console.error("repair context save error", error);
        alert("Phiếu sửa chữa chính đã lưu, nhưng Mức độ ưu tiên/Người báo/Ghi chú chưa lưu được. Vui lòng mở phiếu và lưu lại.");
      }
      return result;
    };
  }

  async function loadContexts() {
    try {
      const rows = await originalApi("/api/repair-contexts");
      CONTEXTS = new Map((rows || []).map(r => [Number(r.repair_id), r]));
    } catch (error) {
      console.warn("Không tải được thông tin bổ sung phiếu sửa chữa", error);
      CONTEXTS = new Map();
    }
  }

  if (typeof window.loadData === "function") {
    const originalLoadData = window.loadData;
    window.loadData = async function () {
      await originalLoadData();
      await loadContexts();
      if (typeof REPAIR_ROWS !== "undefined") {
        REPAIR_ROWS = REPAIR_ROWS.map(r => {
          const c = CONTEXTS.get(Number(r.id)) || {};
          const merged = {
            ...r,
            repair_priority: c.priority || "Bình thường",
            repair_reporter: c.reporter || "",
            repair_note: c.note || ""
          };
          // Phiếu tạo từ sự cố cũ từng gán nhầm người báo thành người thực hiện.
          // Chỉ sửa ở lớp hiển thị; khi người dùng lưu phiếu, giá trị đúng sẽ được ghi vào phiếu chính.
          if (c.source_incident_id && c.reporter && merged.person === c.reporter && merged.work === "Chờ kiểm tra và xử lý kỹ thuật") {
            merged.person = "";
          }
          return merged;
        });
        if (typeof applyFilter === "function") applyFilter();
      }
    };
  }

  if (typeof window.resetRepairForm === "function") {
    const originalResetRepairForm = window.resetRepairForm;
    window.resetRepairForm = function () {
      originalResetRepairForm();
      setStandardMethods(el("method"), "Nội bộ");
      if (el("priority")) el("priority").value = "Bình thường";
      if (el("reporter")) el("reporter").value = "";
      if (el("note")) el("note").value = "";
    };
  }

  if (typeof window.editRepair === "function") {
    const originalEditRepair = window.editRepair;
    window.editRepair = function (id) {
      const row = (typeof REPAIR_ROWS !== "undefined" ? REPAIR_ROWS : []).find(r => Number(r.id) === Number(id));
      originalEditRepair(id);
      // resetRepairForm() bên trong editRepair đưa danh sách về 3 hình thức chuẩn;
      // nếu là dữ liệu cũ thì thêm tạm giá trị cũ để không làm mất thông tin khi chỉnh sửa.
      if (row) setStandardMethods(el("method"), row.method || "Nội bộ");
      const c = CONTEXTS.get(Number(id)) || {};
      if (el("priority")) el("priority").value = row?.repair_priority || c.priority || "Bình thường";
      if (el("reporter")) el("reporter").value = row?.repair_reporter || c.reporter || "";
      if (el("note")) el("note").value = row?.repair_note || c.note || "";
      if (row?.source_incident_id && c.reporter && row.person === "") {
        if (el("person")) el("person").value = "";
      }
    };
  }

  // Xuất đầy đủ các trường đang có trên phiếu sửa chữa.
  window.exportRepairsExcel = function () {
    const rows = (typeof FILTERED_REPAIRS !== "undefined" ? FILTERED_REPAIRS : []).map((r, i) => ({
      "STT": i + 1,
      "Thời gian tiếp nhận": r.received_at || r.repair_date || "",
      "Mã thiết bị": r.device_code || "",
      "Tên thiết bị": r.device_name || "",
      "Khoa/phòng": r.department_name || r.department_code || "",
      "Vị trí": r.location || "",
      "Mức độ ưu tiên": r.repair_priority || "Bình thường",
      "Người báo / ghi nhận": r.repair_reporter || "",
      "Nguyên nhân hỏng": r.issue || "",
      "Nội dung sửa chữa": r.work || "",
      "Người thực hiện": r.person || "",
      "Trạng thái xử lý": r.processing_status || "",
      "Hình thức": r.method || "",
      "Kinh phí": r.cost || 0,
      "Kết quả": r.result || "",
      "TTTB sau sửa": r.status_after || "",
      "Ghi chú": r.repair_note || ""
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "SuaChua");
    XLSX.writeFile(wb, `bao_cao_sua_chua_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  document.addEventListener("DOMContentLoaded", () => {
    removeLegacyUserBox();
    setStandardMethods(el("method"), el("method")?.value || "Nội bộ");
    setStandardMethods(el("methodFilter"), "");
    if (el("methodFilter")) {
      el("methodFilter").insertAdjacentHTML("afterbegin", '<option value="ALL">Tất cả hình thức</option>');
      el("methodFilter").value = "ALL";
    }
  });
})();
