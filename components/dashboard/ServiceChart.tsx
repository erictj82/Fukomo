
"use client";

import {
    PieChart,
    Pie,
    Cell,
    Tooltip,
    ResponsiveContainer
} from "recharts";

import { useSettings } from "@/components/providers/SettingsProvider";

interface ServiceChartProps {
    data: {
        name: string;
        revenue: number;
    }[];
}

const COLORS = [
    '#8B7355', // Khaki Dark
    '#A08865',
    '#B59D75', // Khaki Gold
    '#C1A982',
    '#D2BB94', // Khaki Light
    '#E3CCA6',
    '#4A5D23', // Olive Green
    '#6B8E23', // Olive Drab
    '#8F9779', // Sage Green
    '#C7B49A', // Desert Sand
    '#808080'  // Gray for Others
];

export default function ServiceChart({ data }: ServiceChartProps) {
    const { settings } = useSettings();

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 h-80 flex flex-col">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Service Revenue Distribution</h3>
            <div className="flex-1 flex gap-4 overflow-hidden">
                {/* Left: Pie Chart */}
                <div className="w-[45%] h-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={data}
                                cx="50%"
                                cy="50%"
                                innerRadius="50%"
                                outerRadius="80%"
                                paddingAngle={2}
                                dataKey="revenue"
                                stroke="none"
                            >
                                {data.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: '#fff',
                                    borderRadius: '8px',
                                    border: '1px solid #e5e7eb',
                                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                                }}
                                formatter={(value: number) => [`${settings.symbol}${value.toLocaleString('id-ID')}`, 'Revenue']}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                {/* Right: Scrollable Legend & Data */}
                <div className="w-[55%] h-full overflow-y-auto pr-2 space-y-3 custom-scrollbar pb-2">
                    {data.map((entry, index) => (
                        <div key={index} className="flex items-center justify-between text-xs border-b border-gray-50 pb-2 last:border-0 last:pb-0">
                            <div className="flex items-center gap-2 max-w-[65%]">
                                <div 
                                    className="w-2.5 h-2.5 rounded-full shrink-0" 
                                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                                ></div>
                                <span className="text-gray-600 truncate font-medium" title={entry.name}>
                                    {entry.name}
                                </span>
                            </div>
                            <span className="font-bold text-gray-900 truncate">
                                {settings.symbol}{(entry.revenue || 0).toLocaleString('id-ID')}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

