"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useTenantRouter } from "@/hooks/useTenantRouter";
import { format, parse, addMinutes } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  User,
  Plus,
  List,
  Edit,
  Trash2,
  Search,
  CheckCircle,
  MoreVertical,
  Filter,
  DollarSign,
  ShoppingCart,
  Play,
  EyeOff,
  Ban,
} from "lucide-react";
import Modal from "@/components/dashboard/Modal";
import FormInput, {
  FormSelect,
  FormButton,
} from "@/components/dashboard/FormInput";
import SearchableSelect from "@/components/dashboard/SearchableSelect";
import MultiSearchableSelect from "@/components/dashboard/MultiSearchableSelect";
import StaffCalendar from "@/components/appointments/StaffCalendar";
import CustomerForm from "@/components/dashboard/CustomerForm";
import { useSettings } from "@/components/providers/SettingsProvider";

interface Service {
  _id: string;
  name: string;
  description?: string;
  duration: number;
  price: number;
  commissionType?: "percentage" | "fixed";
  commissionValue?: number;
}

interface Staff {
  _id: string;
  name: string;
  commissionRate: number;
}

interface Customer {
  _id: string;
  name: string;
  phone?: string;
}

interface Appointment {
  _id: string;
  customer: Customer;
  staff?: Staff;
  services: {
    service: Service;
    name: string;
    price: number;
    duration: number;
  }[];
  date: string;
  startTime: string; // "14:00"
  endTime: string;
  totalAmount: number;
  discount: number;
  commission: number;
  status: string;
  notes?: string;
  cancelReason?: string;
  workSyncStatus?: string;
  workOrderNumber?: string;
  statusHistory?: { status: string; fromStatus?: string; at: string; by?: string; note?: string }[];
}

const SALON_SLOTS = Array.from({ length: ((20 - 8) * 60) / 15 + 1 }, (_, i) => {
  const total = 8 * 60 + i * 15;
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
});

export default function AppointmentsPage() {
  const { settings } = useSettings();
  const params = useParams();
  const slug = params.slug as string;
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"calendar" | "list">("list");
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] =
    useState<Appointment | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    customerId: "",
    staffId: "",
    serviceIds: [] as string[],
    startTime: "",
    date: format(new Date(), "yyyy-MM-dd"),
    discount: 0,
    notes: "",
    status: "confirmed",
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<any>({
    total: 0,
    page: 1,
    limit: 10,
    pages: 0,
  });
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [formError, setFormError] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const router = useTenantRouter();

  // Slot system state
  const [availableSlots, setAvailableSlots] = useState<any[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  useEffect(() => {
    fetchResources();
  }, []);

  // Update service IDs when services are loaded, if we're editing an appointment
  useEffect(() => {
    if (editingAppointment && services.length > 0 && isModalOpen) {
      // Extract service IDs from the appointment - s.service is an ObjectId (string when serialized)
      const serviceIds = editingAppointment.services
        .map((s) => {
          // Handle both string (from API) and object (if populated) cases
          if (typeof s.service === "string") {
            return s.service;
          }
          // If it's an object (populated), get the _id
          return (s.service as any)?._id || String(s.service);
        })
        .filter(Boolean) as string[];

      // Ensure service IDs are valid and exist in the current services list
      const validServiceIds = serviceIds.filter(
        (id) => id && services.some((service) => service._id === id),
      );

      // Update service IDs - this ensures they're selected once services load
      setFormData((prevFormData) => ({
        ...prevFormData,
        serviceIds: validServiceIds,
      }));
    }
  }, [services, editingAppointment, isModalOpen]);

  // Fetch available slots when staff and date are selected
  useEffect(() => {
    if (formData.staffId && formData.date && isModalOpen) {
      fetchAvailableSlots();
    } else {
      setAvailableSlots([]);
    }
  }, [formData.staffId, formData.date, formData.serviceIds, isModalOpen]);

  useEffect(() => {
    fetchAppointments();
  }, [page, statusFilter, startDate, endDate, debouncedSearchTerm]); // Re-fetch on filter change

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (debouncedSearchTerm !== searchTerm) {
        setPage(1);
        setDebouncedSearchTerm(searchTerm);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm, debouncedSearchTerm]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        activeDropdown &&
        !(event.target as Element).closest(".dropdown-trigger")
      ) {
        setActiveDropdown(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [activeDropdown]);

  const fetchResources = async () => {
    try {
      const headers = { "x-store-slug": slug };
      const [staffRes, serviceRes, customerRes] = await Promise.all([
        fetch("/api/staff/appointment-list", { headers }),
        fetch("/api/services?limit=0", { headers }),
        fetch("/api/customers?limit=0", { headers }),
      ]);
      const staffData = await staffRes.json();
      const serviceData = await serviceRes.json();
      const customerData = await customerRes.json();

      if (staffData.success) setStaffList(staffData.data);
      if (serviceData.success) setServices(serviceData.data);
      if (customerData.success) setCustomers(customerData.data);
    } catch (error) {
      console.error("Failed to fetch resources:", error);
    }
  };

  const fetchAvailableSlots = async (signal?: AbortSignal) => {
    if (!formData.staffId || !formData.date) {
      setAvailableSlots([]);
      return;
    }

    setLoadingSlots(true);
    try {
      const excludeId = editingAppointment?._id || "";
      const res = await fetch(
        `/api/staff-slots?staffId=${formData.staffId}&date=${formData.date}&excludeAppointmentId=${excludeId}`,
        { headers: { "x-store-slug": slug }, signal }
      );
      const data = await res.json();
      if (data.success) {
        // Use availableSlotsForBooking if available, otherwise fall back to availableSlots
        const slots =
          data.data.availableSlotsForBooking || data.data.availableSlots || [];
        // Filter to only show available slots for booking
        setAvailableSlots(
          slots.filter((slot: any) => slot.isAvailable !== false),
        );
      } else {
        setAvailableSlots([]);
      }
    } catch (error) {
      console.error("Error fetching slots:", error);
      setAvailableSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  };

  const fetchAppointments = async () => {
    setLoading(true);
    let url = `/api/appointments?page=${page}&limit=10&search=${debouncedSearchTerm}&status=${statusFilter}`;
    if (startDate) url += `&start=${startDate}`;
    if (endDate) url += `&end=${endDate}`;

    try {
      const res = await fetch(url, {
        headers: { "x-store-slug": slug }
      });
      const data = await res.json();
      if (data.success) {
        setAppointments(data.data);
        if (data.pagination) setPagination(data.pagination);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (id: string, newStatus: string, extra: Record<string, string> = {}) => {
    try {
      const res = await fetch(`/api/appointments/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-store-slug": slug },
        body: JSON.stringify({ status: newStatus, ...extra }),
      });
      const data = await res.json();
      if (data.success) {
        fetchAppointments();
        setCancelTarget(null);
        setCancelReason("");
      } else {
        alert(data.error || "Gagal mengubah status");
      }
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.startTime) {
      setFormError("Please select a time slot");
      return;
    }

    setIsSubmitting(true);

    try {
      // Calculate details
      const selectedServices = services.filter((s) =>
        formData.serviceIds.includes(s._id),
      );
      const totalDuration = selectedServices.reduce(
        (sum, s) => sum + s.duration,
        0,
      );
      const subtotal = selectedServices.reduce((sum, s) => sum + s.price, 0);

      const discount = formData.discount || 0;
      const tax = subtotal * (settings.taxRate / 100);
      const totalAmount = subtotal + tax - discount;

      // Calculate commission
      let commission = 0;
      selectedServices.forEach((svc) => {
        const commValue = Number(svc.commissionValue || 0);
        if (svc.commissionType === "percentage") {
          commission += (svc.price * commValue) / 100;
        } else {
          commission += commValue;
        }
      });

      // Calculate endTime
      const startDateTime = parse(
        formData.startTime,
        "HH:mm",
        new Date(formData.date),
      );
      const endDateTime = addMinutes(startDateTime, totalDuration);
      const endTime = format(endDateTime, "HH:mm");

      const payload: any = {
        customer: formData.customerId,
        services: selectedServices.map((s) => ({
          service: s._id,
          name: s.name,
          description: (s.description || "").trim() || undefined,
          price: s.price,
          duration: s.duration,
        })),
        date: formData.date,
        startTime: formData.startTime,
        endTime,
        totalDuration,
        totalAmount,
        discount,
        commission,
        status: formData.status,
        notes: formData.notes,
      };

      const url = editingAppointment
        ? `/api/appointments/${editingAppointment._id}`
        : "/api/appointments";
      const method = editingAppointment ? "PUT" : "POST";

      const res = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json", "x-store-slug": slug },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        fetchAppointments();
        setRefreshTrigger((prev) => prev + 1);
        closeModal();
      } else {
        setFormError(data.error || "Failed to save appointment");
      }
    } catch (error) {
      console.error("Error submitting appointment:", error);
      setFormError("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this appointment?")) return;
    try {
      const res = await fetch(`/api/appointments/${id}`, {
        method: "DELETE",
        headers: { "x-store-slug": slug }
      });
      const data = await res.json();
      if (data.success) {
        fetchAppointments();
      }
    } catch (error) {
      console.error("Error deleting appointment:", error);
    }
  };

  const openEditModal = (apt: Appointment) => {
    setEditingAppointment(apt);
    // Extract service IDs - s.service is an ObjectId (string when serialized from API)
    const serviceIds = apt.services
      .map((s) => {
        // Handle both string (from API) and object (if populated) cases
        if (typeof s.service === "string") {
          return s.service;
        }
        // If it's an object (populated), get the _id
        return (s.service as any)?._id || String(s.service);
      })
      .filter(Boolean) as string[]; // Remove any undefined/null values

    // Only filter if services are already loaded, otherwise keep all IDs
    // This ensures services are selected even if services list hasn't loaded yet
    const validServiceIds =
      services.length > 0
        ? serviceIds.filter((id) =>
            services.some((service) => service._id === id),
          )
        : serviceIds;

    setFormData({
      customerId: apt.customer._id,
      staffId: apt.staff?._id || "",
      serviceIds: validServiceIds,
      startTime: apt.startTime,
      date: format(new Date(apt.date), "yyyy-MM-dd"),
      discount: (apt as any).discount || 0,
      notes: apt.notes || "",
      status: apt.status,
    });
    setFormError("");
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingAppointment(null);
    setFormError("");
    setFormData({
      customerId: "",
      staffId: "",
      serviceIds: [],
      startTime: "",
      date: format(new Date(), "yyyy-MM-dd"),
      discount: 0,
      notes: "",
      status: "confirmed",
    });
  };

  // [FE-07 FIX] Dead code timeSlots dihapus — sudah diganti dengan availableSlots dari API

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col h-screen overflow-hidden">
      <div className="bg-white border-b border-gray-200 px-4 md:px-6 py-4 flex flex-col md:flex-row items-center justify-between shrink-0 gap-4">
        <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 self-start md:self-auto">
            Appointments
          </h1>
          <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200 w-full md:w-auto justify-center">
            <button
              onClick={() => setView("list")}
              className={`flex-1 md:flex-none px-3 py-1.5 rounded-md text-xs font-bold transition-all flex justify-center items-center gap-2 ${
                view === "list"
                  ? "bg-white text-blue-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <List className="w-3.5 h-3.5" />
              List View
            </button>
            <button
              onClick={() => setView("calendar")}
              className={`flex-1 md:flex-none px-3 py-1.5 rounded-md text-xs font-bold transition-all flex justify-center items-center gap-2 ${
                view === "calendar"
                  ? "bg-white text-blue-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              Staff Calendar
            </button>
          </div>
        </div>
        <button
          onClick={() => {
            setEditingAppointment(null);
            setFormData({
              customerId: "",
              staffId: "",
              serviceIds: [],
              startTime: "",
              date: format(new Date(), "yyyy-MM-dd"),
              discount: 0,
              notes: "",
              status: "confirmed",
            });
            setFormError("");
            setIsModalOpen(true);
          }}
          className="w-full md:w-auto px-4 py-2 bg-blue-900 text-white rounded-lg hover:bg-blue-800 transition-colors flex justify-center items-center gap-2 font-medium"
        >
          <Plus className="w-4 h-4" />
          New Appointment
        </button>
      </div>

      <div className="flex-1 overflow-auto bg-white flex flex-col">
        <div className="p-6 space-y-6">
          {view === "calendar" ? (
            <StaffCalendar
              slug={slug}
              refreshTrigger={refreshTrigger}
              onSelectEvent={async (event) => {
                try {
                  const res = await fetch(`/api/appointments/${event.id}`, {
                    headers: { "x-store-slug": slug }
                  });
                  const data = await res.json();
                  if (data.success) openEditModal(data.data);
                } catch (error) {
                  console.error("Error opening appointment:", error);
                }
              }}
            />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden text-black">
              {/* List View Filters */}
              <div className="p-4 border-b border-gray-200 flex flex-col md:flex-row gap-4 items-center justify-between bg-gray-50/50">
                <div className="relative w-full md:w-96">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search by customer or staff name..."
                    className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 transition-all text-sm"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                  <button
                    onClick={() => {
                      const today = format(new Date(), "yyyy-MM-dd");
                      setStartDate(today);
                      setEndDate(today);
                      setPage(1);
                    }}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors font-medium ${
                      startDate === format(new Date(), "yyyy-MM-dd") && endDate === format(new Date(), "yyyy-MM-dd")
                        ? "bg-purple-50 border-purple-300 text-purple-700"
                        : "bg-white border-gray-200 hover:border-gray-300 text-gray-600 shadow-sm"
                    }`}
                  >
                    Hari Ini
                  </button>
                  <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-2 py-1 shadow-sm w-full sm:w-auto text-sm">
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        setPage(1);
                      }}
                      className="bg-transparent border-none focus:ring-0 text-gray-700 outline-none w-full"
                    />
                    <span className="text-gray-400">-</span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => {
                        setEndDate(e.target.value);
                        setPage(1);
                      }}
                      className="bg-transparent border-none focus:ring-0 text-gray-700 outline-none w-full"
                    />
                  </div>
                  <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 shadow-sm w-full sm:w-auto">
                    <Filter className="w-4 h-4 text-gray-400" />
                    <select
                      className="bg-transparent border-none focus:ring-0 text-sm font-medium text-gray-700 w-full sm:w-auto"
                      value={statusFilter}
                      onChange={(e) => {
                        setStatusFilter(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="">All Statuses</option>
                      <option value="pending">Pending</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="processing">Processing</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                      <option value="no-show">No-show</option>
                    </select>
                  </div>
                  <button
                    onClick={() => {
                      setSearchTerm("");
                      setStatusFilter("");
                      setStartDate("");
                      setEndDate("");
                      setPage(1);
                    }}
                    className="text-gray-500 w-full sm:w-auto hover:text-gray-700 font-medium text-sm px-2 text-center"
                  >
                    Reset
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 hidden md:table">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Appointment
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Customer
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Staff
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Services
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {loading && appointments.length === 0 ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i} className="animate-pulse">
                          <td colSpan={7} className="px-6 py-4">
                            <div className="h-4 bg-gray-100 rounded"></div>
                          </td>
                        </tr>
                      ))
                    ) : appointments.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-6 py-12 text-center text-gray-500"
                        >
                          <CalendarIcon className="w-12 h-12 mx-auto mb-3 opacity-20" />
                          <p>No appointments found</p>
                        </td>
                      </tr>
                    ) : (
                      appointments.map((apt) => (
                        <tr
                          key={apt._id}
                          className={`transition-colors ${apt.status === "completed" ? "bg-gray-100/50 opacity-75 grayscale" : "hover:bg-gray-50/50"}`}
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-blue-50 rounded-lg">
                                <Clock className="w-4 h-4 text-blue-900" />
                              </div>
                              <div>
                                <span className="text-sm font-bold text-gray-900">
                                  {format(new Date(apt.date), "dd MMM yyyy")}
                                </span>
                                <div className="text-[10px] text-gray-400 font-medium uppercase">
                                  {apt.startTime} - {apt.endTime}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-semibold text-gray-900">
                              {apt.customer.name}
                            </div>
                            {apt.customer.phone && (
                              <div className="text-[10px] text-gray-500">
                                {apt.customer.phone}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2 text-sm text-gray-700">
                              <User className="w-3.5 h-3.5 text-gray-400" />
                              {apt.staff?.name || "—"}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {apt.services.map((s, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100"
                                >
                                  {s.name}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm font-bold text-gray-900">
                              {settings.symbol}
                              {(apt.totalAmount ?? 0).toLocaleString("id-ID", {
                                maximumFractionDigits: 0,
                              })}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`text-[10px] uppercase tracking-widest font-black px-2.5 py-1 rounded-full border ${
                                apt.status === "confirmed"
                                  ? "bg-green-50 text-green-700 border-green-200"
                                  : apt.status === "processing"
                                    ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                    : apt.status === "completed"
                                    ? "bg-blue-50 text-blue-700 border-blue-200"
                                    : apt.status === "pending"
                                      ? "bg-yellow-50 text-yellow-700 border-yellow-200"
                                      : apt.status === "cancelled" || apt.status === "no-show"
                                        ? "bg-red-50 text-red-700 border-red-200"
                                      : "bg-gray-100 text-gray-700 border-gray-200"
                              }`}
                            >
                              {apt.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              {apt.status === "confirmed" && (
                                <button
                                  onClick={() => handleStatusUpdate(apt._id, "processing")}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-white bg-indigo-700 rounded-lg hover:bg-indigo-800"
                                  title="Processing — kirim ke Work"
                                >
                                  <Play className="w-3.5 h-3.5" /> Processing
                                </button>
                              )}
                              {["confirmed", "processing"].includes(apt.status) && (
                                <button
                                  onClick={() => handleStatusUpdate(apt._id, "no-show")}
                                  className="inline-flex items-center justify-center p-1.5 text-gray-400 hover:text-stone-700 border rounded-lg"
                                  title="No Show"
                                >
                                  <EyeOff className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {!["completed", "cancelled", "no-show"].includes(apt.status) && (
                                <button
                                  onClick={() => { setCancelTarget(apt); setCancelReason(""); }}
                                  className="inline-flex items-center justify-center p-1.5 text-gray-400 hover:text-red-600 border rounded-lg"
                                  title="Cancelled"
                                >
                                  <Ban className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {apt.status === "processing" && (
                                <button
                                  onClick={() => router.push(`/pos?appointmentId=${apt._id}`)}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
                                  title="Tarik draft nota ke POS"
                                >
                                  <ShoppingCart className="w-3.5 h-3.5" />
                                  POS
                                </button>
                              )}
                              <button
                                onClick={() => openEditModal(apt)}
                                className="inline-flex items-center justify-center p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 border border-gray-200 rounded-lg transition-colors"
                                title="Edit"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDelete(apt._id)}
                                className="inline-flex items-center justify-center p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 border border-gray-200 rounded-lg transition-colors"
                                title="Hapus"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>

                {/* Mobile Card View */}
                <div className="md:hidden flex flex-col divide-y divide-gray-100 border-t border-gray-100">
                  {loading && appointments.length === 0 ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="p-4 animate-pulse space-y-3">
                        <div className="h-4 bg-gray-100 rounded w-1/2"></div>
                        <div className="h-4 bg-gray-100 rounded w-1/3"></div>
                        <div className="h-10 bg-gray-100 rounded"></div>
                      </div>
                    ))
                  ) : appointments.length === 0 ? (
                    <div className="p-12 text-center text-gray-500">
                      <CalendarIcon className="w-12 h-12 mx-auto mb-3 opacity-20" />
                      <p>No appointments found</p>
                    </div>
                  ) : (
                    appointments.map((apt) => (
                      <div
                        key={apt._id}
                        className={`p-4 transition-colors flex flex-col gap-3 ${apt.status === "completed" ? "bg-gray-100/50 opacity-75 grayscale" : "hover:bg-gray-50/50"}`}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-50 rounded-lg">
                              <Clock className="w-4 h-4 text-blue-900" />
                            </div>
                            <div>
                              <h3 className="text-sm font-bold text-gray-900">
                                {format(new Date(apt.date), "dd MMM yyyy")}
                              </h3>
                              <p className="text-xs text-blue-700 font-semibold uppercase">
                                {apt.startTime} - {apt.endTime}
                              </p>
                            </div>
                          </div>
                          <div className="relative dropdown-trigger">
                            <button
                              onClick={() =>
                                setActiveDropdown(
                                  activeDropdown === apt._id ? null : apt._id,
                                )
                              }
                              className="p-2 -mr-2 text-gray-400 hover:text-blue-900 rounded-lg"
                            >
                              <MoreVertical className="w-5 h-5" />
                            </button>
                            {activeDropdown === apt._id && (
                              <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-100 rounded-xl shadow-xl z-50 py-1">
                                {apt.status === "confirmed" && (
                                  <button
                                    onClick={() => { handleStatusUpdate(apt._id, "processing"); setActiveDropdown(null); }}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-white bg-indigo-700"
                                  >
                                    <Play className="w-4 h-4" /> Processing
                                  </button>
                                )}
                                {["confirmed", "processing"].includes(apt.status) && (
                                  <button
                                    onClick={() => { handleStatusUpdate(apt._id, "no-show"); setActiveDropdown(null); }}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                                  >
                                    <EyeOff className="w-4 h-4" /> No Show
                                  </button>
                                )}
                                {!["completed", "cancelled", "no-show"].includes(apt.status) && (
                                  <button
                                    onClick={() => { setCancelTarget(apt); setCancelReason(""); setActiveDropdown(null); }}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
                                  >
                                    <Ban className="w-4 h-4" /> Cancelled
                                  </button>
                                )}
                                {apt.status === "processing" && (
                                    <button
                                      onClick={() => {
                                        router.push(`/pos?appointmentId=${apt._id}`);
                                      }}
                                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-blue-700 bg-blue-50/50 hover:bg-blue-100 transition-colors"
                                    >
                                      <ShoppingCart className="w-4 h-4" /> POS
                                    </button>
                                  )}
                                <button
                                  onClick={() => {
                                    openEditModal(apt);
                                    setActiveDropdown(null);
                                  }}
                                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 transition-colors"
                                >
                                  <Edit className="w-4 h-4 text-blue-600" />{" "}
                                  Edit Details
                                </button>
                                <div className="h-px bg-gray-100 my-1" />
                                <button
                                  onClick={() => {
                                    handleDelete(apt._id);
                                    setActiveDropdown(null);
                                  }}
                                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" /> Cancel/Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-sm pt-1">
                          <div>
                            <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1">
                              Customer
                            </p>
                            <p className="font-semibold text-gray-900">
                              {apt.customer.name}
                            </p>
                            {apt.customer.phone && (
                              <p className="text-xs text-gray-500">
                                {apt.customer.phone}
                              </p>
                            )}
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1">
                              Staff
                            </p>
                            <p className="font-medium flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 text-blue-400" />
                              {apt.staff?.name || "—"}
                            </p>
                          </div>
                        </div>

                        <div>
                          <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1">
                            Services
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {apt.services.map((s, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100"
                              >
                                {s.name}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="flex justify-between items-end pt-3 border-t border-gray-100 mt-2">
                          <div>
                            <span
                              className={`text-[10px] uppercase tracking-widest font-black px-2.5 py-1 rounded-full border ${
                                apt.status === "confirmed"
                                  ? "bg-green-50 text-green-700 border-green-200"
                                  : apt.status === "processing"
                                    ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                    : apt.status === "completed"
                                    ? "bg-blue-50 text-blue-700 border-blue-200"
                                    : apt.status === "pending"
                                      ? "bg-yellow-50 text-yellow-700 border-yellow-200"
                                      : apt.status === "cancelled" || apt.status === "no-show"
                                        ? "bg-red-50 text-red-700 border-red-200"
                                      : "bg-gray-100 text-gray-700 border-gray-200"
                              }`}
                            >
                              {apt.status}
                            </span>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-0.5">
                              Total
                            </p>
                            <span className="text-lg font-black text-gray-900">
                              {settings.symbol}
                              {(apt.totalAmount ?? 0).toLocaleString("id-ID", {
                                maximumFractionDigits: 0,
                              })}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* List View Pagination */}
              <div className="px-4 py-4 bg-gray-50 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-sm text-gray-500 font-medium text-center sm:text-left">
                  Showing{" "}
                  <span className="text-gray-900">{appointments.length}</span>{" "}
                  of <span className="text-gray-900">{pagination.total}</span>{" "}
                  appointments
                </div>
                <div className="flex items-center justify-center gap-2 w-full sm:w-auto">
                  <button
                    onClick={() => page > 1 && setPage(page - 1)}
                    disabled={page <= 1}
                    className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from(
                      { length: Math.min(5, pagination.pages) },
                      (_, i) => {
                        let pageNum;
                        if (pagination.pages <= 5) {
                          pageNum = i + 1;
                        } else if (pagination.page <= 3) {
                          pageNum = i + 1;
                        } else if (pagination.page >= pagination.pages - 2) {
                          pageNum = pagination.pages - 4 + i;
                        } else {
                          pageNum = pagination.page - 2 + i;
                        }
                        return (
                          <button
                            key={pageNum}
                            onClick={() => setPage(pageNum)}
                            className={`w-8 h-8 rounded-lg text-sm font-semibold transition-all ${
                              page === pageNum
                                ? "bg-blue-900 text-white"
                                : "text-gray-600 hover:bg-gray-100"
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      },
                    )}
                  </div>
                  <button
                    onClick={() => page < pagination.pages && setPage(page + 1)}
                    disabled={page >= pagination.pages}
                    className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingAppointment ? "Edit Appointment" : "New Appointment"}
      >
        <form onSubmit={handleSubmit}>
          {formError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm font-medium">
              {formError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormInput
              label="Date"
              type="date"
              required
              value={formData.date}
              onChange={(e) =>
                setFormData({ ...formData, date: e.target.value })
              }
            />
            <FormInput
              label={`Discount (${settings.symbol})`}
              type="number"
              min="0"
              value={formData.discount}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  discount: parseFloat(e.target.value) || 0,
                })
              }
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div className="flex flex-col relative w-full">
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-semibold text-gray-900 ml-1">Customer</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setIsCustomerModalOpen(true);
                  }}
                  className="text-[10px] font-bold text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1 bg-blue-50 px-2 py-0.5 rounded-full"
                >
                  <Plus className="w-3 h-3" /> New
                </button>
              </div>
              <SearchableSelect
                placeholder="Select Customer"
                required
                value={formData.customerId}
                onChange={(value) =>
                  setFormData({ ...formData, customerId: value })
                }
                options={customers.map((c) => ({
                  value: c._id,
                  label: `${c.name} (${c.phone || "No phone"})`,
                }))}
              />
            </div>
          </div>

          <MultiSearchableSelect
            label="Services"
            placeholder="Select Services"
            required
            value={formData.serviceIds}
            onChange={(values) =>
              setFormData({ ...formData, serviceIds: values })
            }
            options={services.map((s) => ({
              value: s._id,
              label: `${s.name} (${settings.symbol}${s.price})`,
            }))}
            key={`service-select-${editingAppointment?._id || "new"}`}
          />

          <div className="mt-6">
            <label className="block text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-900" />
              Jam (jam buka salon 08:00–20:00)
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 p-3 bg-gray-50 border border-gray-200 rounded-xl max-h-48 overflow-y-auto shadow-inner">
              {SALON_SLOTS.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setFormData({ ...formData, startTime: slot })}
                  className={`px-3 py-2.5 text-xs font-bold rounded-lg border transition-all duration-200 ${
                    formData.startTime === slot
                      ? "bg-blue-900 text-white border-blue-900 shadow-lg scale-105"
                      : "bg-white text-gray-700 border-gray-300 hover:border-blue-400 hover:text-blue-700 hover:bg-blue-50"
                  }`}
                >
                  {slot}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 p-4 bg-gradient-to-br from-blue-900 to-indigo-900 rounded-2xl text-white shadow-xl">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-blue-100 text-[10px] font-bold uppercase tracking-wider">
                  Estimated Duration
                </p>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-300" />
                  <span className="text-xl font-bold">
                    {services
                      .filter((s) => formData.serviceIds.includes(s._id))
                      .reduce((a, b) => a + b.duration, 0)}{" "}
                    min
                  </span>
                </div>
              </div>
              <div className="h-10 w-px bg-white/20" />
              <div className="text-right space-y-1">
                <p className="text-blue-100 text-[10px] font-bold uppercase tracking-wider">
                  Total Amount
                </p>
                <div className="flex items-center justify-end gap-2">
                  <DollarSign className="w-5 h-5 text-emerald-400" />
                  <span className="text-2xl font-black">
                    {settings.symbol}
                    {(
                      services
                        .filter((s) => formData.serviceIds.includes(s._id))
                        .reduce((a, b) => a + b.price, 0) *
                        (1 + settings.taxRate / 100) -
                      (formData.discount || 0)
                    ).toLocaleString("id-ID", { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormSelect
              label="Status"
              value={formData.status}
              onChange={(e: any) =>
                setFormData({ ...formData, status: e.target.value })
              }
              options={[
                { value: "pending", label: "Pending" },
                { value: "confirmed", label: "Confirmed" },
              ]}
            />
            <FormInput
              label="Notes"
              value={formData.notes}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
              placeholder="Optional notes"
            />
          </div>

          {editingAppointment?.statusHistory && editingAppointment.statusHistory.length > 0 && (
            <div className="mt-4 border border-gray-100 rounded-xl p-3 bg-gray-50">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Riwayat status</p>
              <ul className="space-y-1 max-h-32 overflow-y-auto">
                {editingAppointment.statusHistory.map((h, i) => (
                  <li key={i} className="text-xs text-gray-700">
                    {h.at ? format(new Date(h.at), "dd MMM yyyy HH:mm") : "—"} · <b>{h.status}</b>
                    {h.note ? ` — ${h.note}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-4 mt-6">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              {editingAppointment?.status === "processing" && (
                <button
                  type="button"
                  onClick={() => router.push(`/pos?appointmentId=${editingAppointment._id}`)}
                  className="w-full sm:w-auto px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 hover:-translate-y-0.5"
                >
                  <ShoppingCart className="w-4 h-4" />
                  POS
                </button>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={closeModal}
                className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <FormButton
                type="submit"
                loading={isSubmitting}
                className="w-full sm:w-auto"
              >
                {editingAppointment ? "Update Appointment" : "Book Appointment"}
              </FormButton>
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={!!cancelTarget}
        onClose={() => { setCancelTarget(null); setCancelReason(""); }}
        title="Batalkan appointment"
      >
        <p className="text-sm text-gray-600 mb-3">Alasan pembatalan wajib diisi.</p>
        <FormInput
          label="Alasan"
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          placeholder="Contoh: customer reschedule"
        />
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" className="px-4 py-2 border rounded-lg" onClick={() => { setCancelTarget(null); setCancelReason(""); }}>Batal</button>
          <button
            type="button"
            className="px-4 py-2 bg-red-600 text-white rounded-lg font-bold disabled:opacity-50"
            disabled={!cancelReason.trim()}
            onClick={() => cancelTarget && handleStatusUpdate(cancelTarget._id, "cancelled", { cancelReason: cancelReason.trim() })}
          >
            Simpan cancelled
          </button>
        </div>
      </Modal>

      {/* New Customer Modal */}
      <Modal
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
        title="Add New Customer"
      >
        <CustomerForm
          onSuccess={(customer) => {
            fetchResources(); // Refresh customers list
            setFormData({ ...formData, customerId: customer._id });
            setIsCustomerModalOpen(false);
          }}
          onCancel={() => setIsCustomerModalOpen(false)}
        />
      </Modal>
    </div>
  );
}


