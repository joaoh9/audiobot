# Text -> Speech -> Youtube Video

This Script does the following:
1. reads text files from a folder
2. sends the content from each file from this folder to Google's Text-to-Speech API
3. saves the response from the Google's Text-to-Speech API to an .mp3 file
4. Generates an Image with the name of the file and a header (initially the name of the book)
5. With the .mp3 file and .png file, it generates a .mp4 file to another folder
6. youtubev50.js file reads the contet from the newly generated folder with .mp4 files, and upload them to youtube, using OAuth2.0