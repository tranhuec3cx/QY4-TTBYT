/* UI bổ sung cho trang Sự cố: mở form trong modal, không thay đổi API hay luồng nghiệp vụ. */
(function(){
  function openIncidentDialog(){
    const dialog = q("incidentDialog");
    if (!dialog) return;
    resetIncidentForm();
    const presetDeviceId = new URLSearchParams(window.location.search).get("device_id");
    if (presetDeviceId && DEVICES.some(d => String(d.id) === String(presetDeviceId))) {
      q("deviceId").value = presetDeviceId;
      fillDeviceMeta();
    }
    dialog.showModal();
  }

  function closeIncidentDialog(){
    const dialog = q("incidentDialog");
    if (dialog?.open) dialog.close();
  }

  document.addEventListener("DOMContentLoaded", () => {
    const dialog = q("incidentDialog");
    const form = q("incidentForm");
    const newBtn = q("newIncidentBtn");
    const closeBtn = q("closeIncidentDialogBtn");
    const cancelBtn = q("cancelIncidentBtn");

    if (newBtn) newBtn.onclick = openIncidentDialog;
    if (closeBtn) closeBtn.onclick = closeIncidentDialog;
    if (cancelBtn) cancelBtn.onclick = closeIncidentDialog;

    if (dialog) {
      dialog.addEventListener("click", (e) => {
        const rect = dialog.getBoundingClientRect();
        const outside = e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom;
        if (outside) closeIncidentDialog();
      });
    }

    /* Nếu sau này có nút Cập nhật sự cố, vẫn mở cùng modal này. */
    if (typeof window.editIncident === "function") {
      const originalEditIncident = window.editIncident;
      window.editIncident = function(id){
        originalEditIncident(id);
        if (dialog && !dialog.open) dialog.showModal();
      };
    }

    /* saveIncident() reset form khi lưu thành công; theo dõi dấu hiệu đó để đóng modal. */
    if (form && dialog) {
      form.addEventListener("submit", () => {
        const startedWithDescription = q("description")?.value || "";
        if (!startedWithDescription.trim()) return;
        const startedAt = Date.now();
        const watcher = window.setInterval(() => {
          if (!dialog.open || Date.now() - startedAt > 6000) {
            clearInterval(watcher);
            return;
          }
          const saved = !q("incidentId").value && !(q("description")?.value || "").trim() && !q("deviceId").value;
          if (saved) {
            clearInterval(watcher);
            dialog.close();
          }
        }, 120);
      });
    }
  });
})();
