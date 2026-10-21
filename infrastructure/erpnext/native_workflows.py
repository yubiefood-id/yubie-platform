"""Exercise ERPNext's native documents using LOCAL SYNTHETIC transactions.

Quantities, rates and BOM below are test fixtures, never Yubie specifications.
"""
import frappe
from frappe.utils import today, add_days

assert frappe.local.site == "erp.yubie.test", "Refusing non-local ERP site"
frappe.set_user("Administrator")
company = "Yubie Synthetic Acceptance"
supplier = "Yubie Synthetic Supplier"
if not frappe.db.exists("Price List", "Synthetic IDR"):
    frappe.get_doc({"doctype": "Price List", "price_list_name": "Synthetic IDR", "currency": "IDR", "selling": 1, "buying": 1, "enabled": 1}).insert()
if not frappe.db.exists("Supplier", supplier):
    frappe.get_doc({"doctype": "Supplier", "supplier_name": supplier, "supplier_group": "All Supplier Groups", "supplier_type": "Company", "country": "Indonesia"}).insert()

from erpnext.buying.doctype.purchase_order.purchase_order import make_purchase_receipt
from erpnext.stock.doctype.purchase_receipt.purchase_receipt import make_purchase_invoice

po_name = frappe.db.get_value("Purchase Order", {"company": company, "docstatus": 1}, "name")
if not po_name:
    po = frappe.get_doc({"doctype": "Purchase Order", "supplier": supplier, "company": company, "currency": "IDR", "conversion_rate": 1, "schedule_date": today(), "items": [{"item_code": "YBF-250", "qty": 10, "rate": 1000, "schedule_date": today(), "warehouse": "Manufacturing - YTS"}]})
    po.insert()
    po.submit()
    po_name = po.name

receipt_name = frappe.db.get_value("Purchase Receipt", {"company": company, "docstatus": 1}, "name")
if not receipt_name:
    receipt = make_purchase_receipt(po_name)
    for row in receipt.items:
        row.batch_no = "YUBIE-SYNTHETIC-LOCAL-BATCH"
        row.use_serial_batch_fields = 1
    receipt.insert()
    receipt.submit()
    receipt_name = receipt.name

if not frappe.db.count("Purchase Invoice", {"company": company, "docstatus": 1}):
    invoice = make_purchase_invoice(receipt_name)
    invoice.insert()
    invoice.submit()

bom_name = frappe.db.get_value("BOM", {"company": company, "item": "YBF-1000", "docstatus": 1}, "name")
if not bom_name:
    bom = frappe.get_doc({"doctype": "BOM", "company": company, "currency": "IDR", "item": "YBF-1000", "quantity": 1, "is_active": 1, "is_default": 1, "items": [{"item_code": "YBF-250", "qty": 1, "rate": 1000}]})
    bom.insert()
    bom.submit()
    bom_name = bom.name

if not frappe.db.count("Work Order", {"company": company, "docstatus": 1}):
    order = frappe.get_doc({"doctype": "Work Order", "company": company, "production_item": "YBF-1000", "bom_no": bom_name, "qty": 1, "source_warehouse": "Manufacturing - YTS", "wip_warehouse": "Manufacturing - YTS", "fg_warehouse": "Quarantine - YTS", "skip_transfer": 1})
    order.insert()
    order.submit()
from erpnext.manufacturing.doctype.work_order.work_order import make_stock_entry
order = frappe.get_doc("Work Order", frappe.db.get_value("Work Order", {"company": company, "docstatus": 1}, "name"))
finished_batch = "YUBIE-SYNTHETIC-FINISHED-BATCH"
if not frappe.db.exists("Batch", finished_batch):
    frappe.get_doc({"doctype": "Batch", "batch_id": finished_batch, "item": "YBF-1000", "manufacturing_date": today(), "expiry_date": add_days(today(), 30)}).insert()
if not order.produced_qty:
    manufacture = frappe.get_doc(make_stock_entry(order.name, "Manufacture", qty=1))
    for row in manufacture.items:
        row.batch_no = finished_batch if row.item_code == "YBF-1000" else "YUBIE-SYNTHETIC-LOCAL-BATCH"
        row.use_serial_batch_fields = 1
    manufacture.insert()
    manufacture.submit()

entry_name = frappe.db.get_value("Stock Entry", {"work_order": order.name, "docstatus": 1}, "name")
if not frappe.db.count("Quality Inspection", {"item_code": "YBF-1000", "docstatus": 1}):
    inspection = frappe.get_doc({"doctype": "Quality Inspection", "inspection_type": "In Process", "reference_type": "Stock Entry", "reference_name": entry_name, "item_code": "YBF-1000", "sample_size": 1, "inspected_by": "qa@yubie.test", "status": "Accepted", "remarks": "SYNTHETIC fixture only; not a food-safety or commercial batch approval"})
    inspection.insert()
    inspection.submit()

if not frappe.db.count("Delivery Note", {"company": company, "docstatus": 1}):
    release = frappe.get_doc({"doctype": "Stock Entry", "stock_entry_type": "Material Transfer", "company": company, "items": [{"item_code": "YBF-1000", "qty": 1, "s_warehouse": "Quarantine - YTS", "t_warehouse": "Released - YTS", "batch_no": finished_batch, "use_serial_batch_fields": 1}]})
    release.insert()
    release.submit()
    customer = "Yubie Synthetic Customer"
    if not frappe.db.exists("Customer", customer):
        if not frappe.db.exists("Customer Group", "Synthetic Customers"):
            frappe.get_doc({"doctype": "Customer Group", "customer_group_name": "Synthetic Customers", "parent_customer_group": "All Customer Groups", "is_group": 0}).insert()
        frappe.get_doc({"doctype": "Customer", "customer_name": customer, "customer_type": "Company", "customer_group": "Synthetic Customers", "territory": "All Territories"}).insert()
    delivery = frappe.get_doc({"doctype": "Delivery Note", "company": company, "customer": customer, "currency": "IDR", "conversion_rate": 1, "selling_price_list": "Synthetic IDR", "price_list_currency": "IDR", "plc_conversion_rate": 1, "items": [{"item_code": "YBF-1000", "qty": 1, "rate": 2000, "warehouse": "Released - YTS", "batch_no": finished_batch, "use_serial_batch_fields": 1}]})
    delivery.insert()
    delivery.submit()

from erpnext.stock.doctype.delivery_note.delivery_note import make_sales_invoice
if not frappe.db.count("Sales Invoice", {"company": company, "docstatus": 1}):
    sale = make_sales_invoice(frappe.db.get_value("Delivery Note", {"company": company, "docstatus": 1}, "name"))
    sale.insert()
    sale.submit()

from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry
cash = frappe.db.get_value("Account", {"company": company, "account_type": "Cash", "is_group": 0}, "name")
assert cash, "Synthetic company cash account is required"
for doctype in ["Purchase Invoice", "Sales Invoice"]:
    invoice = frappe.get_doc(doctype, frappe.db.get_value(doctype, {"company": company, "docstatus": 1}, "name"))
    if invoice.outstanding_amount:
        payment = get_payment_entry(doctype, invoice.name, bank_account=cash)
        payment.reference_no = "SYNTHETIC-NO-REAL-MONEY"
        payment.reference_date = today()
        payment.insert()
        payment.submit()
frappe.db.commit()
print("LOCAL_NATIVE_DOCUMENTS_PASS: procurement manufacture QA delivery and finance documents; synthetic only, no real-money operation")
