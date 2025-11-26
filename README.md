# UNV AI Report Server V2

This is the backend server for the UNV AI Report project.

This project is a Node.js server that provides a RESTful API for the UNV AI Report application. It uses Express.js as the web framework and Prisma as the ORM for interacting with a SQLite database.

## Getting Started

### Prerequisites

*   Node.js
*   Bun
*   Git

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/your-username/unv-ai-report-server-v2.git
    ```
2.  Install the dependencies:
    ```bash
    bun install
    ```
3.  Set up the environment variables:
    ```bash
    cp .env.example .env
    ```
    Then, fill in the `.env` file with your own values.

### Running the server

```bash
bun dev
```

The server will be running at `http://localhost:3000`.

## Documentation

All documentation is available in the `/docs` directory. This includes:

*   [Architecture](./docs/architecture.md)
*   [API Documentation](./docs/api.md)

## Archive

All old markdown files have been moved to the `/archive` directory. This is for historical purposes and will not be updated.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

This project is licensed under the MIT License.