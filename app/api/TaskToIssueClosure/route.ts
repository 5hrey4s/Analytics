// Example for creating an Asana webhook using the Asana API
await fetch('https://app.asana.com/api/1.0/webhooks', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.ASANA_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    data: {
      resource: '1208551231881087', // Project ID in Asana where tasks are being tracked
      target: 'https://analytics-73as.vercel.app/api/TaskToIssueClosure', // Your server endpoint
    },
  }),
});

import { NextRequest, NextResponse } from 'next/server';

interface AsanaTaskEvent {
  resource: {
    gid: string;
    name: string;
    completed: boolean;
  };
}

export async function POST(req: NextRequest) {
  try {
    const event = await req.json() as AsanaTaskEvent;

    // Check if the task is marked as completed
    if (event.resource.completed) {
      const taskName = event.resource.name;

      // Extract the GitLab issue ID from the task name (assumes "GitLab Issue: #42 - Task Title" format)
      const match = taskName.match(/GitLab Issue: #(\d+)/);
      if (!match) {
        return NextResponse.json({ message: 'GitLab issue ID not found in task title' }, { status: 400 });
      }
      const gitlabIssueId = match[1];

      // Close the corresponding GitLab issue
      const response = await fetch(`https://gitlab.com/api/v4/projects/${process.env.GITLAB_PROJECT_ID}/issues/${gitlabIssueId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${process.env.GITLAB_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          state_event: 'close',
        }),
      });

      if (!response.ok) {
        const errorDetails = await response.json();
        console.error('Failed to close GitLab issue:', errorDetails);
        return NextResponse.json({ message: 'Failed to close GitLab issue', errorDetails }, { status: 500 });
      }

      console.log(`Closed GitLab issue with ID: ${gitlabIssueId}`);
      return NextResponse.json({ message: 'GitLab issue closed' }, { status: 200 });
    } else {
      return NextResponse.json({ message: 'Task not completed, no action taken' }, { status: 200 });
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error('Error processing Asana webhook:', error.message);
      return NextResponse.json({ message: 'Internal Server Error', error: error.message }, { status: 500 });
    } else {
      console.error('Unknown error occurred:', error);
      return NextResponse.json({ message: 'Internal Server Error', error: 'Unknown error' }, { status: 500 });
    }
  }
}
