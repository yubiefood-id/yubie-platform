"""Native, synthetic acceptance only. Execute using bench on erp.yubie.test.

This is never a migration or an importer for operational product specifications.
"""
import frappe
import json
from pathlib import Path
import re


def run():
    assert frappe.local.site == "erp.yubie.test" or re.fullmatch(r"erp\.restore(?:-final|-[a-f0-9]{8})?\.yubie\.test", frappe.local.site), "Local synthetic site required"
    company = "Yubie Synthetic Acceptance"
    assert frappe.db.exists("Company", company), "Synthetic company not provisioned"
    roles = {
        "operations": "Purchase User", "warehouse": "Stock User",
        "manufacturing": "Manufacturing User", "qa": "Quality Manager",
        "finance": "Accounts User", "management": "Auditor",
    }
    for name, role in roles.items():
        user = frappe.get_doc("User", f"{name}@yubie.test")
        assert user.enabled and role in [row.role for row in user.roles]
        assert "System Manager" not in [row.role for row in user.roles]
    assert frappe.has_permission("Item", "read", user="warehouse@yubie.test"), "Readonly integration setup must preserve native operator permissions"
    if frappe.db.exists("User", "integration@yubie.test"):
        assert not frappe.has_permission("Stock Entry", "create", user="integration@yubie.test")
        assert frappe.has_permission("Bin", "read", user="integration@yubie.test")
        # Expected credentials stay in the independent local test secret store;
        # Frappe's standard file backup covers public/files and private/files.
        private = json.loads((Path(frappe.get_site_path()).parent / "erp.yubie.test/private/yubie-synthetic-users.json").read_text())
        assert frappe.get_doc("User", "integration@yubie.test").get_password("api_secret") == private["integration"]["apiSecret"], "Restored encryption key must match the database"
        for folder in ["public", "private"]:
            assert Path(frappe.get_site_path(folder, "files", "yubie-local-restore-proof.txt")).read_text().startswith("SYNTHETIC LOCAL RESTORE PROOF")
    codes = ["YBF-250", "YBF-1000", "YBS-045", "YBS-7X45", "YBP-MINI-035", "YBP-MAXI", "YBP-MINI-5", "YBM-075", "YBM-3X75"]
    for code in codes:
        item = frappe.get_doc("Item", code)
        assert item.stock_uom == "Nos" and item.has_batch_no
        assert item.description.startswith("SYNTHETIC")
    for name in ["Receiving", "Quarantine", "Released", "Manufacturing"]:
        assert frappe.db.exists("Warehouse", f"{name} - YTS")
    assert frappe.db.count("Stock Entry", {"company": company, "docstatus": 1}) >= 2
    assert frappe.db.count("Batch", {"item": "YBF-250"}) >= 1
    for doctype in ["Purchase Order", "Purchase Receipt", "Purchase Invoice", "BOM", "Work Order"]:
        assert frappe.db.count(doctype, {"company": company, "docstatus": 1}) >= 1, f"Native synthetic {doctype} not exercised"
    assert frappe.db.get_value("Work Order", {"company": company, "docstatus": 1}, "produced_qty") == 1, "Manufacturing stock entry not completed"
    assert frappe.db.count("Quality Inspection", {"item_code": "YBF-1000", "docstatus": 1, "status": "Accepted"}) >= 1
    for doctype in ["Delivery Note", "Sales Invoice", "Payment Entry"]:
        assert frappe.db.count(doctype, {"company": company, "docstatus": 1}) >= 1, f"Native synthetic {doctype} not exercised"
    for doctype in ["Purchase Invoice", "Sales Invoice"]:
        assert frappe.db.get_value(doctype, {"company": company, "docstatus": 1}, "outstanding_amount") == 0
    assert frappe.db.get_value("Bin", {"item_code": "YBF-250", "warehouse": "Quarantine - YTS"}, "actual_qty") == 5
    print("LOCAL_NATIVE_WORKFLOWS_PASS: six roles, nine items, procurement, batch stock, manufacture, QA inspection, delivery and reconciled synthetic invoices; no production/operator acceptance implied")


run()
