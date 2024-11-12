import { NextRequest, NextResponse } from 'next/server';

interface GitLabIssueEvent {
  object_kind: string;
  object_attributes: {
    title: string;
    description: string;
    due_date: string | null;
    assignee_ids: number[];
    assignee_id: number;
    id: number;  // GitLab issue ID
  };
}

export async function POST(req: NextRequest) {
  try {
    // Step 1: Verify GitLab secret token
    const gitlabToken = req.headers.get('x-gitlab-token');
    if (gitlabToken !== process.env.GITLAB_SECRET_TOKEN) {
      console.log("Invalid GitLab token.");
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // Step 2: Parse the incoming GitLab webhook event
    const event = await req.json() as GitLabIssueEvent;

    // Step 3: Handle the issue event
    if (event.object_kind === 'issue') {
      const issueTitle = event.object_attributes.title;
      const issueDescription = event.object_attributes.description;
      const dueDate = event.object_attributes.due_date;
      const gitlabIssueId = event.object_attributes.id; // GitLab issue ID

      // Step 4: Map GitLab assignee ID to Asana assignee ID
      const gitlabAssigneeId = event.object_attributes.assignee_ids[0];
      const asanaUserMap = JSON.parse(process.env.GITLAB_TO_ASANA_USER_MAP || '{}');
      const asanaAssigneeId = asanaUserMap[gitlabAssigneeId];

      if (!asanaAssigneeId) {
        console.error(`No Asana ID mapped for GitLab user ID: ${gitlabAssigneeId}`);
        return NextResponse.json({ message: 'Assignee not found in Asana mapping' }, { status: 400 });
      }

      // Step 5: Create a task in Asana using the Asana API
      const asanaResponse = await fetch('https://app.asana.com/api/1.0/tasks', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.ASANA_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: {
            name: issueTitle,
            notes: `${issueDescription}\n\nGitLab Issue Link: https://gitlab.com/productivity-tools1/productivity-analytics-tool/-/issues/${gitlabIssueId}`,
            due_on: dueDate,
            assignee: asanaAssigneeId,
            projects: [process.env.ASANA_PROJECT_ID],
          },
        }),
      });

      if (!asanaResponse.ok) {
        const errorDetails = await asanaResponse.json();
        console.error('Failed to create task in Asana:', errorDetails);
        return NextResponse.json(
          { message: 'Failed to create Asana task', errorDetails },
          { status: 500 }
        );
      }

      const asanaData = await asanaResponse.json();
      const asanaTaskId = asanaData.data.gid;  // Asana task ID
      const asanaTaskUrl = `https://app.asana.com/0/{workspace-id}/${asanaTaskId}`;  // Asana task URL

      // Step 6: Update the GitLab issue description with the Asana task link
      const gitlabUpdateResponse = await fetch(`https://gitlab.com/api/v4/projects/62851225/issues/${gitlabIssueId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${process.env.GITLAB_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description: `${issueDescription}\n\nAsana Task Link: ${asanaTaskUrl}`,
        }),
      });

      if (!gitlabUpdateResponse.ok) {
        const errorDetails = await gitlabUpdateResponse.json();
        console.error('Failed to update GitLab issue:', errorDetails);
        return NextResponse.json(
          { message: 'Failed to update GitLab issue', errorDetails },
          { status: 500 }
        );
      }

      console.log(`Task created in Asana with ID: ${asanaTaskId} and linked to GitLab Issue #${gitlabIssueId}`);

      return NextResponse.json({ message: 'Task created in Asana and linked to GitLab Issue' }, { status: 200 });
    } else {
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
