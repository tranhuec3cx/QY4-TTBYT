// Manual date/time policy for internal incident and repair workflows.
// Public QR incident reporting keeps server-side timestamps for traceability.
(function () {
  function el(id) {
    return document.getElementById(id);
  }

  const page = String(window.location.pathname || "").toLowerCase();

  // INCIDENTS: new records must use a date/time entered by the user.
  if (page.endsWith("/tickets.html") || page.endsWith("/tickets") || page === "/tickets.html") {
    if (typeof resetIncidentForm === "function") {
      const originalResetIncidentForm = resetIncidentForm;
      resetIncidentForm = function () {
        originalResetIncidentForm();
        const id = el("incidentId");
        const time = el("incidentTime");
        if (time && (!id || !id.value)) time.value = "";
      };
    }

    if (typeof transferToRepair === "function") {
      transferToRepair = async function (id) {
        const incident = (typeof INCIDENT_ROWS !== "undefined" ? INCIDENT_ROWS : []).find(
          x => Number(x.id) === Number(id)
        );
        if (!incident) return;

        if (incident.linked_repair_id) {
          window.location.href = `/maintenance.html?repair_id=${encodeURIComponent(incident.linked_repair_id)}&from=tickets`;
          return;
        }

        const dialog = el("transferRepairDialog");
        const incidentId = el("transferIncidentId");
        const time = el("transferRepairTime");
        const summary = el("transferIncidentSummary");
        if (!dialog || !incidentId || !time) {
          alert("Không mở được cửa sổ nhập thời gian tiếp nhận sửa chữa.");
          return;
        }

        incidentId.value = String(id);
        time.value = "";
        if (summary) {
          summary.textContent = `${incident.device_code || ""} - ${incident.device_name || ""}: ${incident.description || ""}`;
        }
        dialog.showModal();
        setTimeout(() => time.focus(), 0);
      };
    }

    document.addEventListener("DOMContentLoaded", () => {
      const form = el("transferRepairForm");
      const dialog = el("transferRepairDialog");
      const cancel = el("cancelTransferRepairBtn");
      if (cancel && dialog) cancel.addEventListener("click", () => dialog.close());

      if (form) {
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          const id = Number(el("transferIncidentId")?.value || 0);
          const inputValue = String(el("transferRepairTime")?.value || "").trim();
          if (!id) return alert("Không xác định được sự cố cần chuyển sửa chữa.");
          if (!inputValue) return alert("Vui lòng tự nhập thời gian tiếp nhận sửa chữa.");

          const incident = (typeof INCIDENT_ROWS !== "undefined" ? INCIDENT_ROWS : []).find(
            x => Number(x.id) === id
          );
          if (!incident) return alert("Không tìm thấy sự cố.");

          const manualTime = typeof fromDateTimeLocalValue === "function"
            ? fromDateTimeLocalValue(inputValue)
            : inputValue.replace("T", " ");

          try {
            const result = await api(`/api/incidents/${id}/transfer-repair`, {
              method: "POST",
              body: JSON.stringify({
                actor: incident.reporter || "Quản trị viên",
                repair_date: manualTime
              })
            });
            if (dialog) dialog.close();
            if (result && result.repair_id) {
              window.location.href = `/maintenance.html?repair_id=${encodeURIComponent(result.repair_id)}&from=tickets`;
            }
          } catch (error) {
            alert(error.message || "Không chuyển được sự cố sang sửa chữa.");
          }
        });
      }
    });
  }

  // REPAIRS: received time and update/history time are controlled by the user.
  if (page.endsWith("/maintenance.html") || page.endsWith("/maintenance") || page === "/maintenance.html") {
    if (typeof resetRepairForm === "function") {
      const originalResetRepairForm = resetRepairForm;
      resetRepairForm = function () {
        originalResetRepairForm();
        const repairId = el("repairId");
        if (!repairId || !repairId.value) {
          const received = el("repairDate");
          if (received) received.value = "";
        }
        const action = el("actionTime");
        if (action) action.value = "";
      };
    }

    if (typeof editRepair === "function") {
      const originalEditRepair = editRepair;
      editRepair = function (id) {
        originalEditRepair(id);
        const action = el("actionTime");
        if (action) action.value = "";
      };
    }

    if (typeof applyIncidentPrefill === "function") {
      const originalApplyIncidentPrefill = applyIncidentPrefill;
      applyIncidentPrefill = function () {
        originalApplyIncidentPrefill();
        if (typeof SOURCE_INCIDENT !== "undefined" && SOURCE_INCIDENT) {
          const received = el("repairDate");
          const action = el("actionTime");
          if (received) received.value = "";
          if (action) action.value = "";
        }
      };
    }

    if (typeof saveRepair === "function") {
      const originalSaveRepair = saveRepair;
      saveRepair = async function (event) {
        const repairId = String(el("repairId")?.value || "");
        const received = String(el("repairDate")?.value || "").trim();
        const saveHistory = Boolean(el("saveHistory")?.checked);
        const actionTime = el("actionTime");

        if (!received) {
          event.preventDefault();
          alert("Vui lòng tự nhập thời gian tiếp nhận.");
          el("repairDate")?.focus();
          return;
        }

        // For a brand-new manual repair, the first history point may use the manually
        // entered received time. For later updates, history time must be entered explicitly.
        if (saveHistory && actionTime && !String(actionTime.value || "").trim()) {
          if (!repairId) {
            actionTime.value = received;
          } else {
            event.preventDefault();
            alert("Vui lòng tự nhập thời gian cập nhật / thực hiện trước khi lưu vào lịch sử sửa chữa.");
            actionTime.focus();
            return;
          }
        }

        return originalSaveRepair(event);
      };
    }
  }
})();
