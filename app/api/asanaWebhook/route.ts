// Example to create a webhook in Asana

import { NextRequest, NextResponse } from "next/server";

const setupAsanaWebhook = async () => {
    try {
      const response = await fetch('https://app.asana.com/api/1.0/webhooks', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.ASANA_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: {
            target: process.env.ASANA_WEBHOOK_ENDPOINT,  // This is the endpoint in your Next.js API to handle events
            resource: process.env.ASANA_PROJECT_ID,      // Your Asana project ID to listen to
          },
        }),
      });
  
      if (response.ok) {
        const jsonResponse = await response.json();
        console.log('Webhook created successfully:', jsonResponse);
      } else {
        console.error('Failed to create webhook:', await response.json());
      }
    } catch (error) {
      console.error('Error creating webhook:', error);
    }
  };
  

  export async function GET(req: NextRequest) {
    // Retrieve the secret key from request headers
    const secret = req.headers.get('X-SECRET-KEY');
    
    // Compare the provided secret with the one stored in your environment variables
    if (secret !== process.env.WEBHOOK_SETUP_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  
    // If the secret matches, proceed with setting up the webhook
    await setupAsanaWebhook();
    return NextResponse.json({ message: 'Webhook setup triggered' });
  }