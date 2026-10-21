"""Create synthetic acceptance fixtures on the dedicated LOCAL site only.

Never run on a production site. No Yubie commercial BOM, shelf life, tax or
specification is approved by these fixtures. Commerce writes remain disabled.
"""
import json
import os
import secrets
from pathlib import Path
import frappe
from frappe.utils import add_days, today

assert frappe.local.site == "erp.yubie.test", "Refusing non-local ERP site"
frappe.set_user("Administrator")
COMPANY = "Yubie Synthetic Acceptance"
from erpnext.setup.setup_wizard.operations.install_fixtures import install
if not frappe.db.exists("Warehouse Type", "Transit"):
    install("Indonesia")
frappe.db.set_single_value("Stock Settings", "enable_serial_and_batch_no_for_item", 1)


def ensure(doctype, name, fields):
    if frappe.db.exists(doctype, name):
        return frappe.get_doc(doctype, name)
    return frappe.get_doc({"doctype": doctype, **fields}).insert()


def write_private_json(path, value):
    temporary = path.with_name(path.name + ".tmp-" + secrets.token_hex(8))
    try:
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "w") as stream:
            json.dump(value, stream)
            stream.flush()
            os.fsync(stream.fileno())
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


ensure("Company", COMPANY, {"company_name": COMPANY, "abbr": "YTS", "default_currency": "IDR", "country": "Indonesia", "chart_of_accounts": "Standard"})
year = today()[:4]
ensure("Fiscal Year", f"SYNTHETIC-{year}", {"year": f"SYNTHETIC-{year}", "year_start_date": f"{year}-01-01", "year_end_date": f"{year}-12-31", "companies": [{"company": COMPANY}]})
for name in ["Receiving", "Quarantine", "Released", "Manufacturing"]:
    ensure("Warehouse", f"{name} - YTS", {"warehouse_name": name, "company": COMPANY})

codes = ["YBF-250", "YBF-1000", "YBS-045", "YBS-7X45", "YBP-MINI-035", "YBP-MAXI", "YBP-MINI-5", "YBM-075", "YBM-3X75"]
for code in codes:
    ensure("Item", code, {"item_code": code, "item_name": f"SYNTHETIC {code}", "description": "SYNTHETIC acceptance fixture; not an approved commercial specification", "item_group": "Products", "stock_uom": "Nos", "is_stock_item": 1, "has_batch_no": 1})

role_map = {"operations": ["Purchase User", "Sales User"], "warehouse": ["Stock User"], "manufacturing": ["Manufacturing User"], "qa": ["Quality Manager"], "finance": ["Accounts User"], "management": ["Auditor"]}
private_path = Path(frappe.get_site_path("private", "yubie-synthetic-users.json"))
private_path.parent.mkdir(parents=True, exist_ok=True)
credentials = json.loads(private_path.read_text()) if private_path.exists() else {}
from frappe.utils.password import update_password
for name, roles in role_map.items():
    email = f"{name}@yubie.test"
    user = ensure("User", email, {"email": email, "first_name": f"Synthetic {name}", "send_welcome_email": 0, "user_type": "System User", "roles": [{"role": role} for role in roles]})
    if name not in credentials:
        credentials[name] = {"user": email, "password": secrets.token_urlsafe(32)}
    update_password(email, credentials[name]["password"])
write_private_json(private_path, credentials)

# A separate API identity can read mapped resources and has no stock-write role.
readonly_role = "Yubie Synthetic Readonly"
ensure("Role", readonly_role, {"role_name": readonly_role, "desk_access": 0})
from frappe.permissions import add_permission, copy_perms
for doctype in ["Item", "Warehouse", "Bin", "Batch"]:
    existing_roles = frappe.get_all("Custom DocPerm", filters={"parent": doctype}, pluck="role")
    if existing_roles and set(existing_roles) == {readonly_role}:
        # Repair an earlier local fixture without erasing any native grants.
        copy_perms(doctype)
    if not frappe.db.exists("Custom DocPerm", {"parent": doctype, "role": readonly_role}):
        # Native helper copies standard permissions before adding a custom role.
        add_permission(doctype, readonly_role, ptype="read")
integration = ensure("User", "integration@yubie.test", {"email": "integration@yubie.test", "first_name": "Synthetic Readonly Integration", "send_welcome_email": 0, "user_type": "System User", "roles": [{"role": readonly_role}]})
if "integration" not in credentials:
    credentials["integration"] = {"apiKey": secrets.token_hex(10), "apiSecret": secrets.token_urlsafe(32)}
integration.api_key = credentials["integration"]["apiKey"]
integration.api_secret = credentials["integration"]["apiSecret"]
integration.save()
if not frappe.db.exists("User Permission", {"user": "integration@yubie.test", "allow": "Warehouse", "for_value": "Released - YTS"}):
    frappe.get_doc({"doctype": "User Permission", "user": "integration@yubie.test", "allow": "Warehouse", "for_value": "Released - YTS", "apply_to_all_doctypes": 1}).insert()
write_private_json(private_path, credentials)
frappe.clear_cache()
for folder in ["public", "private"]:
    marker = Path(frappe.get_site_path(folder, "files", "yubie-local-restore-proof.txt"))
    marker.parent.mkdir(parents=True, exist_ok=True)
    marker.write_text("SYNTHETIC LOCAL RESTORE PROOF; no commercial or customer data\n")

batch = "YUBIE-SYNTHETIC-LOCAL-BATCH"
ensure("Batch", batch, {"batch_id": batch, "item": "YBF-250", "manufacturing_date": today(), "expiry_date": add_days(today(), 30)})

def stock_entry(purpose, source=None, target=None):
    entry = frappe.get_doc({"doctype": "Stock Entry", "stock_entry_type": purpose, "company": COMPANY, "items": [{"item_code": "YBF-250", "qty": 5, "uom": "Nos", "conversion_factor": 1, "s_warehouse": source, "t_warehouse": target, "basic_rate": 1000, "batch_no": batch, "use_serial_batch_fields": 1}]})
    entry.insert()
    entry.submit()

if not frappe.db.count("Stock Entry", {"company": COMPANY, "docstatus": 1}):
    stock_entry("Material Receipt", target="Receiving - YTS")
    stock_entry("Material Transfer", source="Receiving - YTS", target="Quarantine - YTS")
frappe.db.commit()
print("SYNTHETIC_LOCAL_FIXTURES_CREATED; no email sent, no real commercial approval")
