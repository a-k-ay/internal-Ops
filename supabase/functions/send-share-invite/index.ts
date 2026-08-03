import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

Deno.serve(async (req: Request) => {
    try {
        const { email, type, targetTitle, role, inviterName, appUrl } = await req.json();
        const finalAppUrl = appUrl || "http://localhost:5173";

        const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
                from: "C2 Action Board <onboarding@resend.dev>",
                to: [email],
                subject: `Invite: Access granted to ${targetTitle}`,
                html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
            <h2 style="color: #d97706;">Collaboration Invite</h2>
            <p>Hello,</p>
            <p><strong>${inviterName || 'A colleague'}</strong> has invited you to access the <strong>${type}</strong>: "${targetTitle}" with the role of <strong>${role}</strong>.</p>
            <div style="margin: 25px 0;">
                <a href="${finalAppUrl}" style="background-color: #d97706; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">View Action Board</a>
            </div>
            <p style="font-size: 14px; color: #6b7280;">If the button doesn't work, copy and paste this link: <br/> <a href="${finalAppUrl}" style="color: #d97706;">${finalAppUrl}</a></p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
            <p style="font-size: 12px; color: #6b7280;">This is an automated message from C2 Action Board.</p>
          </div>
        `,
            }),
        });

        const data = await response.json();
        return new Response(JSON.stringify(data), {
            headers: { "Content-Type": "application/json" },
            status: response.status,
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
});
