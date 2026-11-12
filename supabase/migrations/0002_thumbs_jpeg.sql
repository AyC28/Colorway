-- Safari cannot encode WebP from a canvas, so its thumbnails are JPEG: allow both in the private bucket.
update storage.buckets set allowed_mime_types = array['image/webp', 'image/jpeg'] where id = 'thumbs';
