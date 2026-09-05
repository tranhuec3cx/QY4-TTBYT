/* Searchable device picker for Incident form.
 * Keeps the existing hidden #deviceId contract so tickets.js/API logic is unchanged.
 * Suggestions are filtered dynamically by code, name, model, serial, department or location.
 */
(function(){
  const $ = (id) => document.getElementById(id);
  const normalize = (value) => {
    if (typeof window.norm === "function") return window.norm(value);
    return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  };
  const escAttr = (value) => String(value || "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/\"/g,"&quot;");

  function devices(){
    return Array.isArray(window.DEVICES)
      ? window.DEVICES
      : (typeof DEVICES !== "undefined" && Array.isArray(DEVICES) ? DEVICES : []);
  }

  function departmentLabel(d){
    return d?.department_name || d?.department_code || "";
  }

  function richDeviceLabel(d){
    if (!d) return "";
    const parts = [
      d.device_code || d.serial || `TB-${d.id}`,
      d.name || "",
      d.model || "",
      d.serial ? `SN: ${d.serial}` : "",
      departmentLabel(d)
    ].filter(Boolean);
    return parts.join(" - ");
  }

  function searchableText(d){
    return normalize([
      d?.device_code,
      d?.name,
      d?.model,
      d?.serial,
      d?.department_code,
      d?.department_name,
      d?.location
    ].filter(Boolean).join(" "));
  }

  function findMatches(raw){
    const value = String(raw || "").trim();
    const rows = devices();
    if (!value) return rows;
    const n = normalize(value);
    const exact = rows.find(d => normalize(richDeviceLabel(d)) === n);
    if (exact) return [exact];
    return rows.filter(d => searchableText(d).includes(n));
  }

  function renderOptions(raw = ""){
    const list = $("incidentDeviceOptions");
    if (!list) return false;
    const rows = findMatches(raw);
    list.innerHTML = rows
      .slice(0, 50)
      .map(d => `<option value="${escAttr(richDeviceLabel(d))}"></option>`)
      .join("");
    return devices().length > 0;
  }

  function applyDevice(device, rewriteSearch = true){
    const hidden = $("deviceId");
    const search = $("incidentDeviceSearch");
    if (!hidden) return;
    hidden.value = device ? String(device.id) : "";
    if (rewriteSearch && search) search.value = device ? richDeviceLabel(device) : "";
    hidden.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function clearDeviceMetaKeepText(){
    const hidden = $("deviceId");
    if (!hidden) return;
    hidden.value = "";
    hidden.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function syncFromSearch(rewriteIfUnique){
    const search = $("incidentDeviceSearch");
    if (!search) return null;
    const raw = search.value.trim();
    if (!raw) {
      applyDevice(null, false);
      return null;
    }
    const matches = findMatches(raw);
    if (matches.length === 1) {
      const exact = normalize(richDeviceLabel(matches[0])) === normalize(raw);
      if (exact || rewriteIfUnique) {
        applyDevice(matches[0], rewriteIfUnique);
        return matches[0];
      }
    }
    clearDeviceMetaKeepText();
    return null;
  }

  function reflectHiddenSelection(){
    const hidden = $("deviceId");
    const search = $("incidentDeviceSearch");
    if (!hidden || !search || !hidden.value) return;
    const d = devices().find(x => String(x.id) === String(hidden.value));
    if (d) search.value = richDeviceLabel(d);
  }

  function install(){
    const search = $("incidentDeviceSearch");
    const form = $("incidentForm");
    const dialog = $("incidentDialog");
    if (!search || !form) return;

    let tries = 0;
    const optionTimer = window.setInterval(() => {
      tries += 1;
      if (renderOptions(search.value) || tries >= 50) window.clearInterval(optionTimer);
    }, 100);

    search.addEventListener("focus", () => renderOptions(search.value));
    search.addEventListener("input", () => {
      renderOptions(search.value);
      syncFromSearch(false);
    });
    search.addEventListener("change", () => {
      renderOptions(search.value);
      syncFromSearch(true);
    });
    search.addEventListener("blur", () => {
      if (search.value.trim() && !$("deviceId").value) syncFromSearch(true);
    });

    form.addEventListener("submit", (event) => {
      if ($("deviceId").value) return;
      const raw = search.value.trim();
      if (!raw) return;
      const matches = findMatches(raw);
      if (matches.length === 1) {
        applyDevice(matches[0], true);
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      alert(matches.length > 1
        ? "Có nhiều thiết bị phù hợp. Vui lòng chọn đúng thiết bị trong danh sách gợi ý."
        : "Không tìm thấy thiết bị phù hợp. Vui lòng chọn thiết bị trong danh sách gợi ý.");
      search.focus();
    }, true);

    if (dialog) {
      const observer = new MutationObserver(() => {
        if (dialog.open) {
          renderOptions(search.value);
          window.setTimeout(reflectHiddenSelection, 0);
        }
      });
      observer.observe(dialog, { attributes: true, attributeFilter: ["open"] });
    }

    /* Keep search text synchronized when tickets.js selects a device programmatically. */
    const hidden = $("deviceId");
    if (hidden) hidden.addEventListener("change", () => {
      if (!hidden.value) return;
      const d = devices().find(x => String(x.id) === String(hidden.value));
      if (d && document.activeElement !== search) search.value = richDeviceLabel(d);
    });

    window.setTimeout(() => {
      renderOptions(search.value);
      reflectHiddenSelection();
    }, 250);
  }

  document.addEventListener("DOMContentLoaded", install);
})();
