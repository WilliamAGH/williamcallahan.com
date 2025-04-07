import React from 'react';

// TODO: Fetch and display GitHub contribution data

const GitHubActivity = () => {
  return (
    <div className="mt-12">
      <h2 className="text-2xl font-bold mb-4">GitHub Activity</h2>
      <p className="text-muted-foreground mb-4">
        Visualizing my recent coding activity from GitHub.
      </p>
      {/* Placeholder for the activity graph */}
      <div className="border rounded-lg p-4 min-h-[150px] flex items-center justify-center text-muted-foreground">
        GitHub Activity Graph Coming Soon...
      </div>
    </div>
  );
};

export default GitHubActivity;
