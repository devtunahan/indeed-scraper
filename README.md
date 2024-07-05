
# Indeed Job Scraper in DACH region

This project is an Express.js-based web scraping tool designed to scrape job listings from Indeed websites for various countries. The tool utilizes Puppeteer with the Stealth Plugin to mimic human browsing behavior and avoid detection. It supports concurrent scraping to enhance performance and speed.

## Features

- Scrape job listings from Indeed websites in Germany, Austria, and Switzerland.
- Use different user agents to mimic various browsers.
- Handle pagination to retrieve multiple pages of job listings.
- Concurrent scraping to improve speed and efficiency.
- Logging with Winston for error tracking and debugging.
- Configurable filters to refine job search results.

## Prerequisites

- Node.js (version 14 or later)
- npm (version 6 or later)

## Installation

Clone the repository:
```bash
git clone https://github.com/yourusername/indeed-job-scraper.git
cd indeed-job-scraper
```
## Send a POST Request to the /scrape Endpoint

To send a POST request to the `/scrape` endpoint with the following JSON payload, use the command below:

```json
{
  "jobTitle": "Software Engineer",
  "location": "Berlin",
  "countries": ["de", "at", "ch"],
  "filters": {
    "salary": "60000",
    "experience": "mid",
    "jobType": "fulltime",
    "posted": "3",
    "radius": "25",
    "company": "Google"
  }
}
```
## Job Search Parameters

- **jobTitle**: The title of the job you want to search for.
- **location**: The location to search for jobs.
- **countries**: A list of country codes (`de` for Germany, `at` for Austria, `ch` for Switzerland) to search in.
- **filters**: Optional filters to refine the job search results:
  - **salary**: The desired salary.
  - **experience**: The experience level required (e.g., entry, mid, senior).
  - **jobType**: The type of job (e.g., fulltime, parttime, contract).
  - **posted**: The time frame for when the job was posted (e.g., last24hours (1), last3days (3), last7days (7)).
  - **radius**: The search radius in kilometers.
  - **company**: The name of the company.

The server will respond with a JSON object containing the scraped job listings, total job count, total pages scraped, and the time taken for the scraping process.

## Configuration

The script can be configured by modifying the following parameters in the `index.js` file:

- **userAgents**: A list of user agents to mimic different browsers.
- **concurrencyLimit**: The number of concurrent scraping tasks to run.
- **randomDelay**: The delay between scraping tasks to avoid detection.

## Logging

Logs are generated using Winston and can be found in the `scraping.log` file. The log level is set to `debug` to capture detailed information about the scraping process.

## Error Handling

Errors during scraping are logged and the page content is saved to a file for further investigation. Failed job scrapes are skipped quickly to continue processing other jobs.

## License

This project is licensed under the MIT License. See the `LICENSE` file for more details.

## Contributions

Contributions are welcome! Please fork the repository and submit a pull request with your changes.