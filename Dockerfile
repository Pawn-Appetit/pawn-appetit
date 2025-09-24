# Use Node.js base image
FROM node:22

# Set environment variables
ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=/usr/local/cargo/bin:$PATH \
    PKG_CONFIG_PATH=/usr/lib/x86_64-linux-gnu/pkgconfig

# Install required system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential \
        curl \
        git \
        autoconf \
        automake \
        libtool \
        pkg-config \
        libgtk-3-dev \
        libjavascriptcoregtk-4.1-dev \
        libwebkit2gtk-4.1-dev \
        libsoup-3.0-dev && \
    rm -rf /var/lib/apt/lists/*

# Install Rust
RUN curl https://sh.rustup.rs -sSf | sh -s -- -y

# Add Rust to PATH
ENV PATH="/root/.cargo/bin:${PATH}"

# Install pnpm
RUN npm install -g pnpm

# Clone the app and set the working directory
RUN git clone https://github.com/Pawn-Appetit/pawn-appetit.git /pawn-appetit
WORKDIR /pawn-appetit

# Install dependencies
RUN pnpm install

# Build the app
RUN pnpm tauri build

# Copy built binary to /output
RUN mkdir -p /output && \
    cp ./src-tauri/target/release/pawn-appetit /output

# Optional: set default command
CMD ["/output/pawn-appetit"]
