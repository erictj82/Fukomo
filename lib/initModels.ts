// This file ensures all Mongoose models are imported and registered
// Import this in API routes that use populate() to avoid MissingSchemaError

import Supplier from "@/models/Supplier";
import Customer from "@/models/Customer";
import Settings from "@/models/Settings";
import User from "@/models/User";
import Role from "@/models/Role";
import ServiceCategory from "@/models/ServiceCategory";
import Service from "@/models/Service";
import Staff from "@/models/Staff";
import Appointment from "@/models/Appointment";
import Product from "@/models/Product";
import Expense from "@/models/Expense";
import Invoice from "@/models/Invoice";
import Purchase from "@/models/Purchase";
import UsageLog from "@/models/UsageLog";
import Payroll from "@/models/Payroll";
import Deposit from "@/models/Deposit";
import StaffSlot from "@/models/StaffSlot";
import PurchaseDeposit from "@/models/PurchaseDeposit";
import ActivityLog from "@/models/ActivityLog";
import PaymentTransaction from "@/models/PaymentTransaction";
import ServicePackage from "@/models/ServicePackage";
import CustomerPackage from "@/models/CustomerPackage";
import PackageUsageLedger from "@/models/PackageUsageLedger";
import PackageOrder from "@/models/PackageOrder";
import WaTemplate from "@/models/WaTemplate";
import WaSchedule from "@/models/WaSchedule";
import WaGreetingLog from "@/models/WaGreetingLog";
import WaFollowUpContact from "@/models/WaFollowUpContact";
import ServiceBundle from "@/models/ServiceBundle";
import Voucher from "@/models/Voucher";
import MedicalRecord from "@/models/MedicalRecord";
import WaBlastLog from "@/models/WaBlastLog";
import CashBalance from "@/models/CashBalance";
import CashSession from "@/models/CashSession";
import CashLog from "@/models/CashLog";
import WalletTransaction from "@/models/WalletTransaction";
import WaCampaignQueue from "@/models/WaCampaignQueue";
import WaAutomation from "@/models/WaAutomation";
import LoyaltyTransaction from "@/models/LoyaltyTransaction";
import Counter from "@/models/Counter";
import StockLog from "@/models/StockLog";
import ShortLink from "@/models/ShortLink";
import Visit from "@/models/Visit";
import IntegrationIdempotency from "@/models/IntegrationIdempotency";
import CorrectionRequest from "@/models/CorrectionRequest";
import AppNotification from "@/models/AppNotification";

// Export all models for convenience
export {
  Supplier,
  Customer,
  Settings,
  User,
  Role,
  ServiceCategory,
  Service,
  Staff,
  Appointment,
  Product,
  Expense,
  Invoice,
  Payroll,
  Deposit,
  Purchase,
  UsageLog,
  StaffSlot,
  PurchaseDeposit,
  ActivityLog,
  PaymentTransaction,
  ServicePackage,
  CustomerPackage,
  PackageUsageLedger,
  PackageOrder,
  WaTemplate,
  WaSchedule,
  WaGreetingLog,
  WaFollowUpContact,
  ServiceBundle,
  Voucher,
  MedicalRecord,
  WaBlastLog,
  CashBalance,
  CashSession,
  CashLog,
  WalletTransaction,
  WaCampaignQueue,
  WaAutomation,
  LoyaltyTransaction,
  Counter,
  StockLog,
  ShortLink,
  Visit,
  IntegrationIdempotency,
  CorrectionRequest,
  AppNotification,
};

// This function can be called to ensure models are loaded
export function initModels() {
  // Models are loaded via imports above
  return {
    Supplier,
    Customer,
    Settings,
    User,
    Role,
    ServiceCategory,
    Service,
    Staff,
    Appointment,
    Product,
    Expense,
    Invoice,
    Payroll,
    Deposit,
    Purchase,
    UsageLog,
    StaffSlot,
    PurchaseDeposit,
    ActivityLog,
    PaymentTransaction,
    ServicePackage,
    CustomerPackage,
    PackageUsageLedger,
    PackageOrder,
    WaTemplate,
    WaSchedule,
    WaGreetingLog,
    WaFollowUpContact,
    ServiceBundle,
    Voucher,
    MedicalRecord,
    WaBlastLog,
    CashBalance,
    CashSession,
    CashLog,
    WalletTransaction,
    WaCampaignQueue,
    WaAutomation,
    LoyaltyTransaction,
    Counter,
    StockLog,
    ShortLink,
    Visit,
    IntegrationIdempotency,
    CorrectionRequest,
    AppNotification,
  };
}