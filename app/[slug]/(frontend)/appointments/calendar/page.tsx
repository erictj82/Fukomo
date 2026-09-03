"use client";


import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { format, parse, addMinutes } from "date-fns";
import { useTenantRouter } from "@/hooks/useTenantRouter";
import { Plus, Clock, User, DollarSign, RefreshCw, Trash2, ShoppingCart } from "lucide-react";
import Modal from "@/components/dashboard/Modal";
import FormInput, { FormSelect, FormButton } from "@/components/dashboard/FormInput";
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
    commissionType?: 'percentage' | 'fixed';
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
    staff: Staff;
    services: { service: Service; name: string; price: number; duration: number }[];
    date: string;
    startTime: string;
    endTime: string;
    totalAmount: number;
    discount: number;
    commission: number;
    status: string;
    notes?: string;
}

export default function CalendarPage() {
  const params = useParams();
  const slug = params.slug as string;
    const { settings } = useSettings();
    const router = useTenantRouter();
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
    const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formError, setFormError] = useState("");

    const [staffList, setStaffList] = useState<Staff[]>([]);
    const [services, setServices] = useState<Service[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [availableSlots, setAvailableSlots] = useState<any[]>([]);
    const [loadingSlots, setLoadingSlots] = useState(false);

    const [formData, setFormData] = useState({
        customerId: "",
        staffId: "",
        serviceIds: [] as string[],
        startTime: "",
        date: format(new Date(), "yyyy-MM-dd"),
        discount: 0,
        notes: "",
        status: "confirmed"
    });

    useEffect(() => {
        fetchResources();
    }, []);

    // [FE-03 FIX] AbortController untuk mencegah race condition slot
    useEffect(() => {
        if (!formData.staffId || !formData.date || !isModalOpen) {
            setAvailableSlots([]);
            return;
        }

        const controller = new AbortController();
        fetchAvailableSlots(controller.signal);

        return () => controller.abort();
    }, [formData.staffId, formData.date, isModalOpen]);

    const fetchResources = async () => {
        const [staffRes, serviceRes, customerRes] = await Promise.all([
            fetch("/api/staff/appointment-list", { headers: { "x-store-slug": slug } }),
            fetch("/api/services?limit=0", { headers: { "x-store-slug": slug } }),
            fetch("/api/customers?limit=0", { headers: { "x-store-slug": slug } })
        ]);
        const staffData = await staffRes.json();
        const serviceData = await serviceRes.json();
        const customerData = await customerRes.json();

        if (staffData.success) setStaffList(staffData.data);
        if (serviceData.success) setServices(serviceData.data);
        if (customerData.success) setCustomers(customerData.data);
    };



    const fetchAvailableSlots = async (signal?: AbortSignal) => {
        setLoadingSlots(true);
        try {
            const excludeId = editingAppointment?._id || "";
            const res = await fetch(`/api/staff-slots?staffId=${formData.staffId}&date=${formData.date}&excludeAppointmentId=${excludeId}`, { headers: { "x-store-slug": slug }, signal });
            const data = await res.json();
            if (data.success) {
                const slots = data.data.availableSlotsForBooking || data.data.availableSlots || [];
                setAvailableSlots(slots.filter((slot: any) => slot.isAvailable !== false));
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.startTime) {
            setFormError("Please select a time slot");
            return;
        }

        setIsSubmitting(true);
        try {
            const selectedServices = services.filter(s => formData.serviceIds.includes(s._id));
            const totalDuration = selectedServices.reduce((sum, s) => sum + s.duration, 0);
            const subtotal = selectedServices.reduce((sum, s) => sum + s.price, 0);

            const discount = formData.discount || 0;
            const tax = subtotal * (settings.taxRate / 100);
            const totalAmount = (subtotal + tax) - discount;

            let commission = 0;
            selectedServices.forEach(svc => {
                const commValue = Number(svc.commissionValue || 0);
                commission += commValue;
            });

            const startDateTime = parse(formData.startTime, "HH:mm", new Date(formData.date));
            const endDateTime = addMinutes(startDateTime, totalDuration);
            const endTime = format(endDateTime, "HH:mm");

            const payload: any = {
                customer: formData.customerId,
                services: selectedServices.map(s => ({
                    service: s._id,
                    name: s.name,
                    description: (s.description || "").trim() || undefined,
                    price: s.price,
                    duration: s.duration
                })),
                date: formData.date,
                startTime: formData.startTime,
                endTime,
                totalDuration,
                totalAmount,
                discount,
                commission,
                status: formData.status,
                notes: formData.notes
            };

            const url = editingAppointment ? `/api/appointments/${editingAppointment._id}` : "/api/appointments";
            const res = await fetch(url, {
                method: editingAppointment ? "PUT" : "POST",
                headers: { "x-store-slug": slug, "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const data = await res.json();
            if (data.success) {
                setRefreshTrigger(prev => prev + 1);
                closeModal();
            } else {
                setFormError(data.error || "Failed to save appointment");
            }
        } catch (error) {
            setFormError("An unexpected error occurred");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!editingAppointment || !confirm("Are you sure you want to cancel/delete this appointment?")) return;

        setIsSubmitting(true);
        try {
            const res = await fetch(`/api/appointments/${editingAppointment._id}`, { headers: { "x-store-slug": slug }, method: "DELETE" });
            const data = await res.json();
            if (data.success) {
                setRefreshTrigger(prev => prev + 1);
                closeModal();
            } else {
                setFormError(data.error || "Failed to delete appointment");
            }
        } catch (error) {
            setFormError("An unexpected error occurred");
        } finally {
            setIsSubmitting(false);
        }
    };

    const openEditModal = (apt: Appointment) => {
        setEditingAppointment(apt);

        // Handle services mapping correctly from populated or unpopulated state
        const serviceIds = apt.services.map(s => {
            if (typeof s.service === 'string') return s.service;
            return (s.service as any)?._id || String(s.service);
        }).filter(Boolean) as string[];

        setFormData({
            customerId: apt.customer?._id || "",
            staffId: apt.staff?._id || "",
            serviceIds: serviceIds,
            startTime: apt.startTime || "",
            date: apt.date ? format(new Date(apt.date), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
            discount: apt.discount || 0,
            notes: apt.notes || "",
            status: apt.status || "confirmed"
        });
        setFormError("");
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingAppointment(null);
        setFormError("");
        setFormData({
            customerId: "", staffId: "", serviceIds: [], startTime: "",
            date: format(new Date(), "yyyy-MM-dd"), discount: 0, notes: "", status: "confirmed"
        });
    };

    const onSelectEvent = async (event: any) => {
        try {
            // Show loading state or just fetch
            const res = await fetch(`/api/appointments/${event.id}`, { headers: { "x-store-slug": slug } });
            const data = await res.json();
            if (data.success) {
                openEditModal(data.data);
            }
        } catch (error) {
            console.error("Error fetching event details:", error);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col h-screen overflow-hidden text-black">
            <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between shrink-0 gap-4">
                <div className="flex items-center gap-4 w-full sm:w-auto">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 shrink-0 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 shadow-sm border border-blue-100">
                        <Clock className="w-5 h-5 sm:w-6 sm:h-6" />
                    </div>
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Salon Calendar</h1>
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                            <p className="text-[10px] sm:text-[11px] text-gray-500 font-bold uppercase tracking-widest">Live Schedule Management</p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <button
                        onClick={() => setRefreshTrigger(prev => prev + 1)}
                        className="p-3 text-gray-500 hover:text-blue-900 hover:bg-blue-50 rounded-2xl transition-all border border-gray-100 bg-white shadow-sm group flex justify-center"
                        title="Refresh"
                    >
                        <RefreshCw className={`w-5 h-5 transition-transform duration-500 group-hover:rotate-180 ${loadingSlots ? "animate-spin" : ""}`} />
                    </button>
                    <button
                        onClick={() => { closeModal(); setIsModalOpen(true); }}
                        className="flex-1 sm:flex-none px-4 sm:px-6 py-3 bg-blue-900 text-white rounded-2xl hover:bg-blue-800 transition-all flex items-center justify-center gap-2 font-bold shadow-lg shadow-blue-900/30 hover:-translate-y-0.5"
                    >
                        <Plus className="w-5 h-5" />
                        Book Appointment
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-auto bg-white p-3 sm:p-6">
                <StaffCalendar
                    slug={slug}
                    refreshTrigger={refreshTrigger}
                    onSelectEvent={onSelectEvent}
                />
            </div>

            <Modal isOpen={isModalOpen} onClose={closeModal} title={editingAppointment ? "Appointment Details" : "New Booking"}>
                <form onSubmit={handleSubmit} className="space-y-5">
                    {formError && (
                        <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-2xl text-xs font-bold flex items-center gap-3">
                            <span className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center text-red-600">!</span>
                            {formError}
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormInput label="Date" type="date" required value={formData.date} onChange={(e: any) => setFormData({ ...formData, date: e.target.value })} />
                        <FormInput label={`Discount (${settings.symbol})`} type="number" min="0" value={formData.discount} onChange={(e: any) => setFormData({ ...formData, discount: parseFloat(e.target.value) || 0 })} />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                            <SearchableSelect placeholder="Select Customer" required value={formData.customerId} onChange={(v) => setFormData({ ...formData, customerId: v })} options={customers.map(c => ({ value: c._id, label: `${c.name} (${c.phone || 'No phone'})` }))} />
                        </div>
                    </div>

                    <MultiSearchableSelect label="Services" placeholder="Select Services" required value={formData.serviceIds} onChange={(vs) => setFormData({ ...formData, serviceIds: vs })} options={services.map(s => ({ value: s._id, label: `${s.name} (${settings.symbol}${s.price})` }))} />

                    <div className="space-y-3">
                        <label className="text-sm font-bold text-gray-700 flex items-center gap-2 px-1">
                            <Clock className="w-4 h-4 text-blue-900" />
                            Jam (08:00–20:00)
                        </label>
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 p-4 bg-gray-50/50 border border-gray-100 rounded-2xl max-h-48 overflow-y-auto">
                            {Array.from({ length: ((20 - 8) * 60) / 15 + 1 }, (_, i) => {
                                const total = 8 * 60 + i * 15;
                                const hh = String(Math.floor(total / 60)).padStart(2, "0");
                                const mm = String(total % 60).padStart(2, "0");
                                return `${hh}:${mm}`;
                            }).map((slot) => (
                                <button
                                    key={slot}
                                    type="button"
                                    onClick={() => setFormData({ ...formData, startTime: slot })}
                                    className={`px-2 py-3 text-[11px] font-black rounded-xl border transition-all ${formData.startTime === slot
                                        ? "bg-blue-900 text-white border-blue-900 shadow-md transform scale-105"
                                        : "bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-900 hover:bg-white shadow-sm"}`}
                                >
                                    {slot}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="p-5 bg-gradient-to-br from-blue-900 via-indigo-900 to-blue-900 rounded-2xl text-white shadow-2xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                            <DollarSign className="w-24 h-24" />
                        </div>
                        <div className="flex justify-between items-center relative z-10">
                            <div className="space-y-1">
                                <p className="text-[10px] font-black uppercase tracking-widest text-blue-200">Session Duration</p>
                                <div className="flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-blue-300" />
                                    <p className="text-2xl font-black">{services.filter(s => formData.serviceIds.includes(s._id)).reduce((a, b) => a + b.duration, 0)} <span className="text-sm font-bold text-blue-300">min</span></p>
                                </div>
                            </div>
                            <div className="w-px h-10 bg-white/20"></div>
                            <div className="text-right space-y-1">
                                <p className="text-[10px] font-black uppercase tracking-widest text-blue-200">Total Charge</p>
                                <p className="text-3xl font-black text-emerald-300">{settings.symbol}{((services.filter(s => formData.serviceIds.includes(s._id)).reduce((a, b) => a + b.price, 0) * (1 + settings.taxRate / 100)) - formData.discount).toLocaleString('id-ID', { maximumFractionDigits: 0 })}</p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormSelect label="Booking Status" value={formData.status} onChange={(e: any) => setFormData({ ...formData, status: e.target.value })} options={[{ value: "pending", label: "Pending" }, { value: "confirmed", label: "Confirmed" }, { value: "processing", label: "Processing" }, { value: "completed", label: "Completed" }, { value: "cancelled", label: "Cancelled" }]} />
                        <FormInput label="Quick Notes" value={formData.notes} onChange={(e: any) => setFormData({ ...formData, notes: e.target.value })} placeholder="Internal notes..." />
                    </div>

                    <div className="flex flex-col-reverse sm:flex-row items-center justify-between pt-4 gap-4">
                        <div className="flex items-center gap-3 w-full sm:w-auto">
                            {editingAppointment && (
                                <button
                                    type="button"
                                    onClick={handleDelete}
                                    className="w-full sm:w-auto px-6 py-3 border border-red-200 text-red-600 rounded-2xl text-sm font-bold hover:bg-red-50 transition-all flex items-center justify-center gap-2"
                                    disabled={isSubmitting}
                                >
                                    <Trash2 className="w-4 h-4" />
                                    Delete
                                </button>
                            )}
                            {editingAppointment && (
                                <button
                                    type="button"
                                    onClick={() => router.push(`/pos?appointmentId=${editingAppointment._id}`)}
                                    className="w-full sm:w-auto px-6 py-3 bg-emerald-600 text-white rounded-2xl text-sm font-bold hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 hover:-translate-y-0.5"
                                >
                                    <ShoppingCart className="w-4 h-4" />
                                    POS
                                </button>
                            )}
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto ml-auto">
                            <button
                                type="button"
                                onClick={closeModal}
                                className="w-full sm:w-auto px-6 py-3 border border-gray-200 rounded-2xl text-sm font-bold text-gray-500 hover:bg-gray-50 transition-all text-center"
                            >
                                Close
                            </button>
                            <FormButton
                                type="submit"
                                loading={isSubmitting}
                                className="w-full sm:w-auto rounded-2xl font-black px-10 shadow-lg shadow-blue-900/20"
                            >
                                {editingAppointment ? "Save Changes" : "Confirm Booking"}
                            </FormButton>
                        </div>
                    </div>
                </form>
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



