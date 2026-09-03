"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Calendar, momentLocalizer, Views, Navigate, View } from "react-big-calendar";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { User, Clock, MapPin, Tag, RefreshCw } from "lucide-react";

const localizer = momentLocalizer(moment);

interface Event {
    id: string;
    title: string;
    start: Date;
    end: Date;
    resourceId: string;
    status: string;
    customer: string;
    staffName: string;
    services: string[];
}

interface Resource {
    id: string;
    title: string;
}

interface StaffCalendarProps {
    onSelectEvent?: (event: any) => void;
    refreshTrigger?: number;
    slug: string;
}

export default function StaffCalendar({ onSelectEvent, refreshTrigger, slug }: StaffCalendarProps) {
    const [events, setEvents] = useState<Event[]>([]);
    const [resources, setResources] = useState<Resource[]>([]);
    const [loading, setLoading] = useState(true);
    const [date, setDate] = useState(new Date());
    const [view, setView] = useState<View>(Views.DAY);

    // Fetch staff as resources
    const fetchResources = useCallback(async () => {
        try {
            const res = await fetch("/api/staff?isActive=true", { headers: { "x-store-slug": slug } });
            const data = await res.json();
            if (data.success) {
                setResources([
                    { id: "unassigned", title: "Unassigned" },
                    ...data.data.map((s: any) => ({
                    id: s._id,
                    title: s.name
                    })),
                ]);
            }
        } catch (error) {
            console.error("Error fetching staff for calendar:", error);
        }
    }, []);

    // Fetch appointments for the current range
    const fetchAppointments = useCallback(async (currentDate: Date, currentView: View) => {
        setLoading(true);
        try {
            let start, end;
            if (currentView === Views.MONTH) {
                start = moment(currentDate).startOf("month").subtract(1, "week").format("YYYY-MM-DD");
                end = moment(currentDate).endOf("month").add(1, "week").format("YYYY-MM-DD");
            } else if (currentView === Views.WEEK) {
                start = moment(currentDate).startOf("week").format("YYYY-MM-DD");
                end = moment(currentDate).endOf("week").format("YYYY-MM-DD");
            } else {
                start = moment(currentDate).startOf("day").format("YYYY-MM-DD");
                end = moment(currentDate).endOf("day").format("YYYY-MM-DD");
            }

            const url = `/api/appointments?start=${start}&end=${end}&limit=1000`;
            const res = await fetch(url, { headers: { "x-store-slug": slug } });
            const data = await res.json();

            if (data.success) {
                const formattedEvents = data.data.map((apt: any) => {
                    const aptDate = moment(apt.date).format("YYYY-MM-DD");
                    const staffName = apt.staff?.name || "Unassigned";
                    return {
                        id: apt._id,
                        title: `${apt.customer?.name || "Customer"} (${staffName})`,
                        start: moment(`${aptDate} ${apt.startTime}`, "YYYY-MM-DD HH:mm").toDate(),
                        end: moment(`${aptDate} ${apt.endTime}`, "YYYY-MM-DD HH:mm").toDate(),
                        resourceId: apt.staff?._id || "unassigned",
                        status: apt.status,
                        customer: apt.customer?.name || "",
                        staffName,
                        services: (apt.services || []).map((s: any) => s.name)
                    };
                });
                setEvents(formattedEvents);
            }
        } catch (error) {
            console.error("Error fetching appointments for calendar:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchResources();
    }, [fetchResources]);

    useEffect(() => {
        fetchAppointments(date, view);
    }, [date, view, refreshTrigger, fetchAppointments]);

    const handleNavigate = (newDate: Date) => {
        setDate(newDate);
    };

    const handleViewChange = (newView: View) => {
        setView(newView);
    };

    const scrollToTime = useMemo(() => moment().set({ h: 9, m: 0 }).toDate(), []);

    const eventStyleGetter = (event: Event) => {
        let backgroundColor = "#3b82f6"; // Default blue
        if (event.status === "completed") backgroundColor = "#10b981"; // Green
        if (event.status === "pending") backgroundColor = "#f59e0b"; // Amber
        if (event.status === "cancelled") backgroundColor = "#ef4444"; // Red

        return {
            style: {
                backgroundColor,
                borderRadius: "6px",
                opacity: 0.9,
                color: "white",
                border: "none",
                display: "block",
                padding: "2px 6px",
                fontSize: "11px",
                fontWeight: "600",
                boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                transition: "transform 0.1s ease",
            },
        };
    };

    return (
        <div className="h-[650px] md:h-[800px] bg-white rounded-2xl shadow-xl border border-gray-100 p-3 md:p-6 flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                <div>
                    <h2 className="text-lg md:text-xl font-bold text-gray-900 capitalize">{{ day: 'Daily', week: 'Weekly', month: 'Monthly' }[view as string] || view} Schedule</h2>
                    <p className="text-xs md:text-sm text-gray-500">Manage appointments across staff members</p>
                </div>
                <button
                    onClick={() => fetchAppointments(date, view)}
                    className="p-2 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 self-start sm:self-auto border border-gray-200"
                    title="Refresh Data"
                >
                    <RefreshCw className={`w-4 h-4 md:w-5 md:h-5 ${loading ? "animate-spin" : ""}`} />
                </button>
            </div>

            <div className="flex-1 relative overflow-x-auto overflow-y-hidden rounded-xl border border-gray-100 bg-gray-50/20">
                <div className="h-full" style={{ minWidth: view === Views.DAY && resources.length > 0 ? Math.max(800, resources.length * 150) : "100%" }}>
                    <Calendar
                        localizer={localizer}
                        events={events}
                        resources={view === Views.DAY ? resources : undefined}
                        resourceIdAccessor="id"
                        resourceTitleAccessor="title"
                        startAccessor="start"
                        endAccessor="end"
                        view={view}
                        date={date}
                        onNavigate={handleNavigate}
                        onView={handleViewChange}
                        views={[Views.DAY, Views.WEEK, Views.MONTH]}
                        step={30}
                        timeslots={2}
                        scrollToTime={scrollToTime}
                        eventPropGetter={eventStyleGetter}
                        onSelectEvent={onSelectEvent}
                        className="rbc-calendar-premium"
                        messages={{
                            noEventsInRange: "No appointments scheduled for this period",
                        }}
                    />
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 md:gap-6 text-xs font-semibold py-2 px-3 md:px-4 bg-gray-50 rounded-lg border border-gray-100">
                <span className="text-gray-400 uppercase tracking-wider w-full sm:w-auto mb-1 sm:mb-0">Legend:</span>
                <div className="flex items-center gap-1.5 md:gap-2">
                    <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                    <span className="text-gray-600">Pending</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                    <span className="text-gray-600">Confirmed</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                    <span className="text-gray-600">Completed</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-red-500"></span>
                    <span className="text-gray-600">Cancelled</span>
                </div>
            </div>

            <style jsx global>{`
                .rbc-calendar-premium {
                    font-family: inherit;
                    background: white;
                }
                .rbc-header {
                    padding: 14px 0;
                    font-weight: 700;
                    color: #374151;
                    background-color: #f8fafc;
                    border-bottom: 2px solid #e2e8f0;
                    font-size: 13px;
                }
                .rbc-toolbar {
                    margin-bottom: 16px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 12px;
                }
                @media (min-width: 768px) {
                    .rbc-toolbar {
                        margin-bottom: 24px;
                        flex-direction: row;
                        justify-content: space-between;
                        gap: 16px;
                    }
                }
                .rbc-toolbar-label {
                    font-size: 1rem;
                    font-weight: 800;
                    color: #1e293b;
                    flex: 1;
                    text-align: center;
                }
                @media (min-width: 768px) {
                    .rbc-toolbar-label {
                        font-size: 1.125rem;
                        text-align: center;
                    }
                }
                .rbc-btn-group {
                    background: #f1f5f9;
                    padding: 4px;
                    border-radius: 12px;
                    border: none;
                }
                .rbc-toolbar button {
                    color: #64748b;
                    border: none;
                    background: transparent;
                    padding: 6px 12px;
                    border-radius: 8px;
                    font-weight: 600;
                    font-size: 12px;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                }
                @media (min-width: 768px) {
                    .rbc-toolbar button {
                        padding: 6px 16px;
                        font-size: 13px;
                    }
                }
                .rbc-toolbar button:hover {
                    background-color: rgba(255,255,255,0.6);
                    color: #1e293b;
                }
                .rbc-toolbar button.rbc-active {
                    background-color: white !important;
                    color: #1e3a8a !important;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
                }
                .rbc-time-view {
                    border: none;
                }
                .rbc-timeslot-group {
                    border-bottom: 1px solid #f1f5f9;
                    min-height: 50px;
                }
                .rbc-time-content {
                    border-top: 2px solid #e2e8f0;
                }
                .rbc-time-gutter .rbc-timeslot-group {
                    border: none;
                }
                .rbc-label {
                    padding: 0 12px;
                    font-size: 12px;
                    font-weight: 500;
                    color: #94a3b8;
                }
                .rbc-event {
                    padding: 2px 4px;
                    border: 1px solid rgba(255,255,255,0.2);
                }
                .rbc-event:hover {
                    z-index: 50 !important;
                    transform: scale(1.02);
                }
                .rbc-current-time-indicator {
                    height: 2px;
                    background-color: #ef4444;
                }
                .rbc-current-time-indicator::before {
                    content: '';
                    position: absolute;
                    left: 0;
                    top: -4px;
                    width: 10px;
                    height: 10px;
                    background: #ef4444;
                    border-radius: 50%;
                }
                .rbc-month-view {
                    border: none;
                    background: #f8fafc;
                }
                .rbc-month-row {
                    background: white;
                    margin-bottom: 2px;
                }
                .rbc-day-bg + .rbc-day-bg {
                    border-left: 1px solid #f1f5f9;
                }
                .rbc-today {
                    background-color: #eff6ff;
                }
                .rbc-show-more {
                    font-weight: 700;
                    color: #2563eb;
                    background: #f1f5f9;
                    border-radius: 4px;
                    font-size: 10px;
                    padding: 2px 4px;
                }
            `}</style>
        </div>
    );
}
