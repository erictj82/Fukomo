import { NextRequest, NextResponse } from 'next/server';
import { processPendingCampaigns, processAutomations } from '@/lib/scheduler';
import { connectToDB } from '@/lib/mongodb';
import { requireInternalApiKey } from '@/lib/internalAuth';

// F-01 Fix: This endpoint proxies the cron trigger without requiring the client to expose CRON_SECRET.
// SECURITY: dijaga INTERNAL_API_KEY (server-to-server). Sebelumnya TANPA auth sama sekali — siapa pun
// yang bisa reach host bisa micu blast WA campaign/automation on-demand. Fail-closed kalau key unset.
export async function POST(request: NextRequest) {
    const auth = requireInternalApiKey(request);
    if (!auth.authorized) return auth.response!;

    try {
        await connectToDB();
        
        // Run both scheduler tasks without awaiting so the API responds quickly
        processPendingCampaigns().catch(console.error);
        processAutomations().catch(console.error);

        return NextResponse.json({ success: true, message: 'Scheduler triggered successfully via internal proxy' });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
