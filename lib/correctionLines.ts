export function linesFromWorkJobs(jobs: unknown[]): {
    fukomoLineId: string;
    jobId: string;
    serviceId: string;
    workServiceId: string;
    name: string;
    quantity: number;
}[] {
    return (Array.isArray(jobs) ? jobs : [])
        .filter((raw) => {
            const j = raw as { status?: string; service_name?: string; name?: string };
            if (!j) return false;
            if (['cancelled'].includes(String(j.status || ''))) return false;
            return Boolean(j.service_name || j.name);
        })
        .map((raw) => {
            const j = raw as {
                id?: string;
                fukomo_line_id?: string;
                line_id?: string;
                fukomo_service_id?: string;
                service_id?: string;
                service_name?: string;
                name?: string;
            };
            const lineId = String(j.fukomo_line_id || j.line_id || '').trim() || (j.id ? `job:${j.id}` : '');
            return {
                fukomoLineId: lineId,
                jobId: String(j.id || ''),
                serviceId: String(j.fukomo_service_id || ''),
                workServiceId: String(j.service_id || ''),
                name: String(j.service_name || j.name || ''),
                quantity: 1,
            };
        })
        .filter((l) => l.fukomoLineId && l.name);
}

export function fallbackAppointmentLines(apt: {
    _id?: unknown;
    services?: {
        fukomoLineId?: string;
        service?: unknown;
        name?: string;
    }[];
}): ReturnType<typeof linesFromWorkJobs> {
    const aptId = String(apt?._id || 'apt');
    return (apt?.services || []).map((s, i) => {
        const serviceId = String((s as { service?: { _id?: string } | string }).service && typeof s.service === 'object'
            ? (s.service as { _id?: string })._id
            : s.service || '');
        return {
            fukomoLineId: String(s.fukomoLineId || '').trim() || `${aptId}:${serviceId || 'svc'}:${i}`,
            jobId: '',
            serviceId,
            workServiceId: '',
            name: String(s.name || ''),
            quantity: 1,
        };
    }).filter((l) => l.name);
}
