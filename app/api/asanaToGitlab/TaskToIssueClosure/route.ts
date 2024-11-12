import { NextRequest, NextResponse } from 'next/server';

interface AsanaTaskEvent {
  action: string;
  resource: {
    gid: string;        // Asana task ID
    completed: boolean; // Whether the task is completed
    name: string;       // Task name
    notes: string;      // Task description (which contains GitLab issue link)
  };
}

export async function POST(req: NextRequest) {
  try {
    const event = (await req.json()) as AsanaTaskEvent;

    // Check if the task is marked as completed
    if (event.action === 'changed' && event.resource.completed) {
      // const taskName = event.resource.name;
      const taskDescription = event.resource.notes;

      // Extract the GitLab issue ID from the task's description or name
      const match = taskDescription.match(/GitLab Issue #(\d+)/);
      if (!match) {
        console.error('GitLab issue ID not found in Asana task description.');
        return NextResponse.json({ message: 'GitLab issue ID not found' }, { status: 400 });
      }

      const gitlabIssueId = match[1];

      // Step 3: Close the GitLab issue via GitLab API
      const gitlabResponse = await fetch(
        `https://gitlab.com/api/v4/projects/${process.env.GITLAB_PROJECT_ID}/issues/${gitlabIssueId}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${process.env.GITLAB_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            state_event: 'close', // This sets the GitLab issue state to "closed"
          }),
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
