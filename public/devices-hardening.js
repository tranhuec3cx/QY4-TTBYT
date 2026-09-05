(function () {
  function safe(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[ch]));
  }

  const originalLoadData = window.loadData;
  if (typeof originalLoadData === "function") {
    window.loadData = async function () {
      await originalLoadData();
      const statusFilter = document.getElementById("statusFilter");
      if (statusFilter && !Array.from(statusFilter.options).some(o => o.value === "Chờ thanh lý")) {
        const option = document.createElement("option");
        option.value = "Chờ thanh lý";
        option.textContent = "Chờ thanh lý";
        const stopOption = Array.from(statusFilter.options).find(o => o.value === "Ngừng hoạt động");
        if (stopOption) statusFilter.insertBefore(option, stopOption);
        else statusFilter.appendChild(option);
      }
    };
  }

  if (typeof window.renderRows === "function") {
    window.renderRows = function () {
      if (q("listCount")) q("listCount").textContent = `${FILTERED.length} thiết bị`;
      q("deviceRows").innerHTML = FILTERED.map((d, i) => `
        <tr>
          <td class="col-stt">${i + 1}</td>
          <td class="device-code">${safe(d.device_code)}</td>
          <td class="device-name-cell"><div class="device-name" title="${safe(d.name)}">${safe(d.name)}</div></td>
          <td class="department-cell"><b>${safe(d.department_code)}</b><div class="small">${safe(d.department_name || departmentName(d.department_code))}</div></td>
          <td>${safe(d.manufacturer)}</td>
          <td>${safe(d.model)}</td>
          <td>${safe(d.serial)}</td>
          <td>${safe(d.year_in_use)}</td>
          <td>${safe(d.location)}</td>
          <td><span class="tag ${statusTagClass(d.status)}">${safe(d.status)}</span></td>
          <td>
            <div class="table-actions device-row-actions">
              <a class="btn btn-sm" href="/device-detail.html?id=${encodeURIComponent(d.id)}">Xem hồ sơ</a>
              <button class="btn btn-sm" onclick="showDeviceQrModal(byId(${Number(d.id)}))">QR</button>
              <button class="btn btn-sm" onclick="editDevice(${Number(d.id)})">Cập nhật</button>
              <button class="btn btn-sm danger-light" title="Chỉ dùng khi nhập nhầm thiết bị" onclick="deleteDevice(${Number(d.id)})">Xóa</button>
            </div>
          </td>
        </tr>
      `).join("") || `<tr><td colspan="11" class="center-empty">Chưa có dữ liệu.</td></tr>`;
    };
  }

  window.deleteDevice = async function (id) {
    const d = typeof byId === "function" ? byId(id) : null;
    const label = d ? `${d.device_code || ""} - ${d.name || ""}`.trim() : `ID ${id}`;
    const ok = confirm(
      `CẢNH BÁO: Xóa thiết bị sẽ xóa cả dữ liệu kỹ thuật liên quan đang gắn với thiết bị này.\n\n${label}\n\nChỉ dùng chức năng Xóa khi thiết bị được nhập nhầm. Thiết bị ngừng sử dụng nên chuyển trạng thái thay vì xóa.\n\nTiếp tục xóa?`
    );
    if (!ok) return;
    await api(`/api/devices/${id}`, { method: "DELETE" });
    await loadData();
  };
})();
