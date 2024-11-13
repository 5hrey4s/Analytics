import { NextRequest, NextResponse } from 'next/server';

interface AsanaTaskEvent {
  action: string;
  resource: {
    gid: string;
    name: string;
    notes: string;
    due_on: string | null;
    assignee: { gid: string };
  };
}

export async function POST(req: NextRequest) {
  try {
    // Step 1: Handle Asana Webhook Handshake
    const hookSecret = req.headers.get('x-hook-secret');
    if (hookSecret) {
      // Respond with the X-Hook-Secret header if this is the handshake request
      return NextResponse.json({}, {
        status: 200,
        headers: { 'X-Hook-Secret': hookSecret },
      });
    }

    // Step 2: Parse the incoming Asana webhook event
    const event = (await req.json()) as AsanaTaskEvent;

    // Step 3: Process only "task added" events
    if (event.action === 'added') {
      const taskName = event.resource.name;
      const taskNotes = event.resource.notes;
      const dueDate = event.resource.due_on;
      const asanaTaskId = event.resource.gid;

      // Step 4: Map Asana assignee ID to GitLab user ID
      const asanaAssigneeId = event.resource.assignee?.gid;
      const asanaUserMap = JSON.parse(process.env.ASANA_TO_GITLAB_USER_MAP || '{}');
      const gitlabAssigneeId = asanaUserMap[asanaAssigneeId];

      if (!gitlabAssigneeId) {
        console.error(`No GitLab ID mapped for Asana user ID: ${asanaAssigneeId}`);
        return NextResponse.json({ message: 'Assignee not found in GitLab mapping' }, { status: 400 });
      }

      // Step 5: Create an issue in GitLab using the GitLab API
      const gitlabResponse = await fetch(`https://gitlab.com/api/v4/projects/${process.env.GITLAB_PROJECT_ID}/issues`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GITLAB_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: taskName,
          description: `Asana Task Link: https://app.asana.com/0/${process.env.ASANA_PROJECT_ID}/${asanaTaskId}`,
          due_date: dueDate,
          assignee_ids: [gitlabAssigneeId],
        }),
      });

      if (!gitlabResponse.ok) {
        const errorDetails = await gitlabResponse.json();
        console.error('Failed to create issue in GitLab:', errorDetails);
        return NextResponse.json(
          { message: 'Failed to create GitLab issue', errorDetails },
          { status: 500 }
        );
      }

      const gitlabData = await gitlabResponse.json();
      const gitlabIssueIid = gitlabData.iid;
      const gitlabIssueUrl = `https://gitlab.com/${process.env.GITLAB_PROJECT_ID}/-/issues/${gitlabIssueIid}`;

      // Step 6: Update the Asana task with the GitLab issue link
      const asanaUpdateResponse = await fetch(`https://app.asana.com/api/1.0/tasks/${asanaTaskId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${process.env.ASANA_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: {
            notes: `${taskNotes}\n\nGitLab Issue Link: ${gitlabIssueUrl}`,
          },
        }),
      });

      if (!asanaUpdateResponse.ok) {
        const errorDetails = await asanaUpdateResponse.json();
        console.error('Failed to update Asana task:', errorDetails);
        return NextResponse.json(
          { message: 'Failed to update Asana task', errorDetails },
          { status: 500 }
        );
      }

      console.log(`Issue created in GitLab with ID: ${gitlabIssueIid} and linked to Asana Task #${asanaTaskId}`);

      return NextResponse.json({ message: 'Issue created in GitLab and linked to Asana Task' }, { status: 200 });
    } else {
      console.log('Event not handled or not a task creation event.');
      return NextResponse.json({ message: 'Event not handled' }, { status: 200 });
    }
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
