import { NextRequest, NextResponse } from 'next/server';

interface GitLabIssueEvent {
  object_kind: string;
  object_attributes: {
    title: string;
    description: string;
    due_date: string | null;
    assignee_ids: number[];
    assignee_id: number;
    iid: number;  // GitLab issue ID
    action: string;  // Action type (e.g., "open", "update", etc.)
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
    const event = (await req.json()) as GitLabIssueEvent;

    // Step 3: Handle only "issue" events where the action is "open"
    if (event.object_kind === 'issue' && event.object_attributes.action === 'open') {
      const issueTitle = event.object_attributes.title;
      const issueDescription = event.object_attributes.description;
      const dueDate = event.object_attributes.due_date;
      const gitlabIssueIid = event.object_attributes.iid;

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
            notes: `GitLab Issue Link: https://gitlab.com/productivity-tools1/productivity-analytics-tool/-/issues/${gitlabIssueIid}`,
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
      const asanaTaskId = asanaData.data.gid;
      const asanaTaskUrl = `https://app.asana.com/0/1208551183794158/${asanaTaskId}`;

      // Step 6: Update the GitLab issue description with the Asana task link
      const gitlabUpdateResponse = await fetch(`https://gitlab.com/api/v4/projects/${process.env.GITLAB_PROJECT_ID}/issues/${gitlabIssueIid}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${process.env.GITLAB_SECRET_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description: `Asana Task Link: ${asanaTaskUrl}`,
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

      console.log(`Task created in Asana with ID: ${asanaTaskId} and linked to GitLab Issue #${gitlabIssueIid}`);

      return NextResponse.json({ message: 'Task created in Asana and linked to GitLab Issue' }, { status: 200 });
    } else {
      console.log('Event not handled or not an issue creation event.');
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
