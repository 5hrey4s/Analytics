import { NextRequest, NextResponse } from 'next/server';

// interface AsanaTaskEvent {
//   action: string;
//   resource: {
//     gid: string;
//     completed: boolean;
//     name: string;
//     notes: string;
//   };
// }

export async function POST(req: NextRequest) {
  try {
    // Step 1: Handle Asana Webhook Handshake
    const hookSecret = req.headers.get('x-hook-secret');
    if (hookSecret) {
      // Respond with the X-Hook-Secret header for verification
      return NextResponse.json({}, {
        status: 200,
        headers: { 'X-Hook-Secret': hookSecret }
      });
    }

    // Step 2: Process Event Payload
    const event = await req.json();
    console.log("Received event:", event, event.events[0].user, event.events[0].change, event.events[0].resource );

    // Check if the task is marked as completed
    if (event.events[0].change.action === 'changed' && event.resource.completed) {
      const taskDescription = event.resource.notes;

      // Extract GitLab issue ID
      const match = taskDescription.match(/https:\/\/gitlab\.com\/[^/]+\/[^/]+\/-\/issues\/(\d+)/);
      if (!match) {
        console.error('GitLab issue ID not found in Asana task description.');
        return NextResponse.json({ message: 'GitLab issue ID not found' }, { status: 400 });
      }

      const gitlabIssueId = match[1];
      console.log(`GitLab issue ID extracted: ${gitlabIssueId}`);

      // Close the GitLab issue
      const gitlabResponse = await fetch(
        `https://gitlab.com/api/v4/projects/${process.env.GITLAB_PROJECT_ID}/issues/${gitlabIssueId}`,
        {
          method: 'PUT',
          headers: {
            'Authorization':`Bearer ${process.env.GITLAB_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ state_event: 'close' })
        }
      );

      if (!gitlabResponse.ok) {
        const errorDetails = await gitlabResponse.json();
        console.error('Failed to close GitLab issue:', errorDetails);
        return NextResponse.json(
          { message: 'Failed to close GitLab issue', errorDetails },
          { status: 500 }
        );
      }

      console.log(`GitLab issue #${gitlabIssueId} closed successfully.`);
      return NextResponse.json({ message: 'GitLab issue closed' }, { status: 200 });
    }

    return NextResponse.json({ message: 'No relevant action' }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error('Error processing webhook:', error.message);
      return NextResponse.json({ message: 'Internal Server Error', error: error.message }, { status: 500 });
    } else {
      console.error('Unknown error occurred:', error);
      return NextResponse.json({ message: 'Internal Server Error', error: 'Unknown error' }, { status: 500 });
    }
  }
}        