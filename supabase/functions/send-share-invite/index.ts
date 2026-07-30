import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(async (_req: Request) => {
    return new Response(JSON.stringify({ message: "Invite email notifications are disabled." }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
    });
});
