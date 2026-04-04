// supabase/functions/push-notify/index.ts
// Triggered by a Database Webhook on intel.claims INSERT WHERE status = 'pending_review'
//
// Deploy: supabase functions deploy push-notify --project-ref xazalbajuvqbqgkgyagf
// Then create a Database Webhook in Supabase Dashboard:
//   Table: intel.claims
//   Events: INSERT
//   Type: Supabase Edge Function → push-notify

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: {
    id: string;
    subject_entity_id: string | null;
    predicate_key: string;
    status: string;
    [key: string]: unknown;
  };
  old_record: null | Record<string, unknown>;
}

Deno.serve(async (req) => {
  try {
    const payload: WebhookPayload = await req.json();

    // Only fire for new claims needing review
    const reviewStatuses = ['pending_review', 'draft'];
    if (payload.type !== 'INSERT' || !reviewStatuses.includes(payload.record?.status)) {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    // Init Supabase with service_role to read operator push tokens
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get all operator push tokens from profiles table
    const { data: profiles, error: profilesError } = await supabase
      .from('operator_profiles')
      .select('expo_push_token')
      .not('expo_push_token', 'is', null);

    if (profilesError || !profiles?.length) {
      console.log('No push tokens found:', profilesError?.message);
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
    }

    // Resolve entity name for the notification body
    let entityName = 'Unknown entity';
    if (payload.record.subject_entity_id) {
      const { data: entity } = await supabase
        .from('entities')
        .select('canonical_name')
        .eq('id', payload.record.subject_entity_id)
        .single();
      if (entity) entityName = entity.canonical_name;
    }

    const predicate = payload.record.predicate_key;

    // Build push messages
    const messages = profiles
      .filter((p) => p.expo_push_token)
      .map((p) => ({
        to: p.expo_push_token,
        sound: 'default',
        title: 'New claim pending review',
        body: `${entityName} → ${predicate}`,
        data: { claimId: payload.record.id, screen: 'queue' },
        categoryId: 'governance',
      }));

    if (messages.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
    }

    // Send via Expo push API (batches up to 100)
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const result = await response.json();
    console.log(`Sent ${messages.length} push notifications:`, result);

    return new Response(
      JSON.stringify({ sent: messages.length, result }),
      { status: 200 }
    );
  } catch (err) {
    console.error('Push notify error:', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500 }
    );
  }
});
