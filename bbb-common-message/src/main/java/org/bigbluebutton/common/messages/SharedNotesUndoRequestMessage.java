package org.bigbluebutton.common.messages;

import java.util.HashMap;
import java.util.Map;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

public class SharedNotesUndoRequestMessage implements ISubscribedMessage {
	public static final String SHARED_NOTES_UNDO_REQUEST = "shared_notes_undo_request";
	public final String VERSION = "0.0.1";

	public final String meetingID;
	public final String requesterID;
	public final String noteID;

	public SharedNotesUndoRequestMessage(String meetingID, String requesterID, String noteID) {
		this.meetingID = meetingID;
		this.requesterID = requesterID;
		this.noteID = noteID;
	}

	public String toJson() {
		HashMap<String, Object> payload = new HashMap<String, Object>();
		payload.put(Constants.MEETING_ID, meetingID);
		payload.put(Constants.REQUESTER_ID, requesterID);
		payload.put(Constants.NOTE_ID, noteID);

		java.util.HashMap<String, Object> header = MessageBuilder.buildHeader(SHARED_NOTES_UNDO_REQUEST, VERSION, null);

		return MessageBuilder.buildJson(header, payload);
	}

	public static SharedNotesUndoRequestMessage fromJson(String message) {
		JsonParser parser = new JsonParser();
		JsonObject obj = (JsonObject) parser.parse(message);

		if (obj.has("header") && obj.has("payload")) {
			JsonObject header = (JsonObject) obj.get("header");
			JsonObject payload = (JsonObject) obj.get("payload");

			if (header.has("name")) {
				String messageName = header.get("name").getAsString();
				if (SHARED_NOTES_UNDO_REQUEST.equals(messageName)) {
					if (payload.has(Constants.MEETING_ID)
							&& payload.has(Constants.REQUESTER_ID)
							&& payload.has(Constants.NOTE_ID)) {
						String meetingID = payload.get(Constants.MEETING_ID).getAsString();
						String requesterID = payload.get(Constants.REQUESTER_ID).getAsString();
						String noteID = payload.get(Constants.NOTE_ID).getAsString();

						return new SharedNotesUndoRequestMessage(meetingID, requesterID, noteID);
					}
				}
			}
		}
		return null;
	}
}