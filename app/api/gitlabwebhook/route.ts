import { NextRequest, NextResponse } from 'next/server';

interface GitLabIssueEvent {
  object_kind: string;
  object_attributes: {
    title: string;
    description: string;
  };
}

export async function POST(req: NextRequest) {
  try {
    // Step 1: Verify GitLab secret token
    const gitlabToken = req.headers.get('x-gitlab-token');
    if (gitlabToken !== process.env.GITLAB_SECRET_TOKEN) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // Step 2: Parse the incoming GitLab webhook event
    const event = await req.json() as GitLabIssueEvent;

    // Step 3: Handle the issue event
    if (event.object_kind === 'issue') {
      const issueTitle = event.object_attributes.title;
      const issueDescription = event.object_attributes.description;

      // Step 4: Create a task in Asana using the Asana API
      const response = await fetch('https://app.asana.com/api/1.0/tasks', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.ASANA_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: {
            name: `GitLab Issue: ${issueTitle}`,
            notes: issueDescription,
            projects: [process.env.ASANA_PROJECT_ID],  // Ensure this project ID is valid
          },
        }),
      });

      // Handle if the response from Asana is not ok
      if (!response.ok) {
        const errorDetails = await response.json();
        console.error('Asana API error:', errorDetails); // Add detailed logging for debugging
        return NextResponse.json(
          { message: 'Failed to create Asana task', errorDetails },
          { status: 500 }
        );
      }

      const asanaData = await response.json();
      console.log(`Created task in Asana with ID: ${asanaData.data.gid}`);

      return NextResponse.json({ message: 'Task created in Asana' }, { status: 200 });
    } else {
      return NextResponse.json({ message: 'Event not handled' }, { status: 200 });
    }
  } catch (error: unknown) {
    // Step 5: Type assertion to narrow down the error type
    if (error instanceof Error) {
      console.error('Error processing webhook:', error.message);
      return NextResponse.json({ message: 'Internal Server Error', error: error.message }, { status: 500 });
    } else {
      console.error('Unknown error occurred:', error);
      return NextResponse.json({ message: 'Internal Server Error', error: 'Unknown error' }, { status: 500 });
    }
  }
}
