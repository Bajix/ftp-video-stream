# ftp-video-stream

FTP CLI to download files & folders from a remote FTP directory into a local directory.

If a folder contains split RAR files, the unarchived contents will be streamed to the respective directory rather than the archives themselves, allowing users to watch videos as they are downloading.

## Installation


```
brew install unrar
npm install -g ftp-video-stream
```

## Configuration

The following environmentment variables need to be set:

`FTP_URI`

FTP URI to connect to.

example: `ftp://username:password@ftp.example.com`

`FTP_LOCAL_DIR`

Local directory to download files to

`FTP_REMOTE_DIR`

Remote directory to download files from

`

## Usage

```
stream-ftp
```