-- AB#45568: the journey part of the public API's Message metadata, kept with
-- the message so the delivery job can label bb.messaging.message.sent. The
-- journey also keeps the citizen's geohash, read from the request's baggage.
CREATE TABLE IF NOT EXISTS message_metadata (
	message_id uuid NOT NULL,
	metadata jsonb NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT message_metadata_pkey PRIMARY KEY (message_id),
	CONSTRAINT message_metadata_message_id_fkey FOREIGN KEY (message_id)
		REFERENCES messages(id) ON DELETE CASCADE
);
