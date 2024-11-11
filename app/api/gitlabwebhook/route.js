
export default async function handler(req, res) {
    if (req.method !== 'POST') {
      return res.status(405).json({ message: 'Method Not Allowed' });
    }
  
    // Verify GitLab secret token
    const gitlabToken = req.headers['x-gitlab-token'];
    if (gitlabToken !== process.env.GITLAB_SECRET_TOKEN) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
  
    const event = req.body;
  
    // Handle GitLab issue events
    if (event.object_kind === 'issue') {
      const issueTitle = event.object_attributes.title;
      const issueDescription = event.object_attributes.description;
  
      try {
        // Use fetch to create a task in Asana
        const response = await fetch('https://app.asana.com/api/1.0/tasks', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.ASANA_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            data: {
              name: `GitLab Issue: ${issueTitle}`,
              notes: issueDescription,
              projects: [process.env.ASANA_PROJECT_ID]
            }
          })
        });
  
        if (!response.ok) {
          console.error(`Failed to create Asana task: ${response.statusText}`);
          return res.status(500).json({ message: 'Failed to create Asana task' });
        }
  
        const asanaData = await response.json();
        console.log(`Created task in Asana with ID: ${asanaData.data.gid}`);
  
        res.status(200).json({ message: 'Task created in Asana' });
      } catch (error) {
        console.error('Error creating task in Asana:', error);
        res.status(500).json({ message: 'Internal Server Error' });
      }
    } else {
      res.status(200).json({ message: 'Event not handled' });
    }
  }
  