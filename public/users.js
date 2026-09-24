
let META = { departments: [] };
let USERS = [];
let AUTH_STATUS = { auth_required:false, ready:true };

function syncUserRoleFields() {
  const role = q("role").value;
  const dept = q("departmentCode");
  const isDepartmentUser = role === "Người dùng khoa";
  dept.required = isDepartmentUser;
  const hint = q("userFormHint");
  if (hint) {
    hint.textContent = isDepartmentUser
      ? "Người dùng khoa bắt buộc gán đúng khoa/phòng. Tài khoản chỉ xem danh mục thiết bị thuộc khoa và báo sự cố qua QR."
      : "Tài khoản: 3–50 ký tự, chỉ dùng chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.";
  }
}

function validateUserFormPayload(payload, isEdit) {
  if (!payload.full_name) return "Vui lòng nhập họ và tên.";
  if (!/^[A-Za-z0-9._-]{3,50}$/.test(payload.username)) return "Tài khoản phải dài 3–50 ký tự và chỉ dùng chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.";
  if (payload.role === "Người dùng khoa" && !payload.department_code) return "Người dùng khoa phải được gán một khoa/phòng.";
  if (payload.password && payload.password.length < 8) return "Mật khẩu phải có ít nhất 8 ký tự.";
  if (!isEdit && AUTH_STATUS.auth_required && !payload.password) return "Khi bật đăng nhập, tài khoản mới phải có mật khẩu.";
  return "";
}
function render() {
  const qText = q("searchInput").value.trim().toLowerCase();
  const data = USERS.filter(u => !qText || [u.full_name, u.username, u.role, u.department_name || "", u.phone || ""].join(" ").toLowerCase().includes(qText));
  q("countLabel").textContent = `${data.length} người dùng`;
  q("rows").innerHTML = data.map((u,i) => `<tr><td>${i+1}</td><td>${u.full_name}</td><td>${u.username}</td><td>${u.role}</td><td>${u.department_name || ""}</td><td>${u.phone || ""}</td><td><span class="tag ${u.has_password ? 'green' : 'yellow'}">${u.has_password ? 'Đã đặt' : 'Chưa đặt'}</span></td><td><span class="tag ${u.status === 'Hoạt động' ? 'green' : 'red'}">${u.status}</span></td><td><div class="actions"><button class="icon-btn" onclick="editUser(${u.id})">✏️</button><button class="icon-btn" onclick="deleteUser(${u.id})">🗑️</button></div></td></tr>`).join("");
}
function editUser(id) {
  const u = USERS.find(x => x.id === id);
  q("userId").value = u.id;
  q("fullName").value = u.full_name;
  q("username").value = u.username;
  q("role").value = u.role;
  q("departmentCode").value = u.department_code || "";
  q("phone").value = u.phone || "";
  q("password").value = "";
  q("status").value = u.status || "Hoạt động";
  syncUserRoleFields();
  q("userForm").scrollIntoView({behavior:"smooth",block:"start"});
}
function resetForm() {
  q("userForm").reset();
  q("userId").value = "";
  q("password").value = "";
  syncUserRoleFields();
}
async function deleteUser(id) {
  const user = USERS.find(x => Number(x.id) === Number(id));
  if (!user) return;
  if (!confirm(`Xóa tài khoản “${user.username}” - ${user.full_name}? Các phiên đăng nhập của tài khoản này sẽ bị thu hồi.`)) return;
  try {
    await api(`/api/users/${id}`, { method: "DELETE" });
    await loadData();
  } catch (e) {
    alert(e.message || "Không xóa được người dùng.");
  }
}
async function loadData() {
  [META, USERS, AUTH_STATUS] = await Promise.all([
    api("/api/meta"),
    api("/api/users"),
    api("/api/auth/status")
  ]);
  q("departmentCode").innerHTML = '<option value="">-- Chọn khoa/phòng --</option>' + opt(META.departments);
  render();
  syncUserRoleFields();
}
document.addEventListener("DOMContentLoaded", async () => {
  setLayout("users","Người dùng","Danh sách tài khoản sử dụng phần mềm quản lý trang thiết bị y tế");
  await loadData();
  q("filterBtn").onclick = render;
  q("searchInput").addEventListener("input", render);
  q("role").addEventListener("change", syncUserRoleFields);
  q("userForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      full_name: q("fullName").value.trim(),
      username: q("username").value.trim(),
      role: q("role").value,
      department_code: q("departmentCode").value,
      phone: q("phone").value.trim(),
      password: q("password").value,
      status: q("status").value
    };
    const id = q("userId").value;
    const error = validateUserFormPayload(payload, Boolean(id));
    if (error) return alert(error);
    try {
      if (id) await api(`/api/users/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      else await api("/api/users", { method: "POST", body: JSON.stringify(payload) });
      resetForm();
      await loadData();
      alert("Đã lưu người dùng.");
    } catch (e) {
      alert(e.message || "Không lưu được người dùng.");
    }
  });
});
