import { DownloadJob } from '../api';

interface DownloadJobListProps {
  jobs: DownloadJob[];
}

export function DownloadJobList({ jobs }: DownloadJobListProps) {
  return (
    <div className="download-jobs">
      <h2>Download Jobs</h2>
      {jobs.length === 0 ? (
        <p className="empty-state">No download jobs yet. Click a button above to start.</p>
      ) : (
        <div className="jobs-list">
          {jobs.map((job, index) => (
            <div key={`${job.jobId}-${index}`} className="job-item">
              <div className="job-header">
                <span className="job-id">Job: {job.jobId}</span>
                <span className={`job-status ${job.status}`}>
                  {job.status.toUpperCase()}
                </span>
              </div>
              <div className="job-details">
                {job.file_id && (
                  <div className="job-detail">
                    <strong>File ID:</strong> {job.file_id}
                  </div>
                )}
                {job.totalFileIds && (
                  <div className="job-detail">
                    <strong>Total Files:</strong> {job.totalFileIds}
                  </div>
                )}
                {job.processingTimeMs && (
                  <div className="job-detail">
                    <strong>Processing Time:</strong>{' '}
                    {(job.processingTimeMs / 1000).toFixed(2)}s
                  </div>
                )}
                {job.size && (
                  <div className="job-detail">
                    <strong>Size:</strong> {(job.size / 1024 / 1024).toFixed(2)} MB
                  </div>
                )}
                {job.message && (
                  <div className="job-detail">
                    <strong>Message:</strong> {job.message}
                  </div>
                )}
                {job.downloadUrl && (
                  <div className="job-detail">
                    <a
                      href={job.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="download-link"
                    >
                      Download File
                    </a>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
