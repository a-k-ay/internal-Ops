import https from 'https';

const RESEND_API_KEY = process.env.RESEND_API_KEY;

function testEmail() {
    const data = JSON.stringify({
        from: "onboarding@resend.dev",
        to: "delivered@resend.dev",
        subject: "Test from C2 Action Board",
        html: "<p>If you see this, the API key is working.</p>",
    });

    const options = {
        hostname: 'api.resend.com',
        path: '/emails',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Length': data.length
        }
    };

    const req = https.request(options, (res) => {
        let responseBody = '';
        res.on('data', (d) => {
            responseBody += d;
        });
        res.on('end', () => {
            console.log('Status:', res.statusCode);
            console.log('Response:', responseBody);
        });
    });

    req.on('error', (error) => {
        console.error('Error:', error);
    });

    req.write(data);
    req.end();
}

testEmail();
