import mongoose, { Schema, Model, models } from 'mongoose';

export interface IAppNotification {
    _id: string;
    user: mongoose.Types.ObjectId;
    type: string;
    title: string;
    body?: string;
    href?: string;
    payload?: Record<string, unknown>;
    readAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const AppNotificationSchema = new Schema<IAppNotification>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        type: { type: String, required: true, index: true },
        title: { type: String, required: true },
        body: { type: String },
        href: { type: String },
        payload: { type: Schema.Types.Mixed },
        readAt: { type: Date },
    },
    { timestamps: true }
);

const AppNotification =
    (models.AppNotification as Model<IAppNotification>) ||
    mongoose.model<IAppNotification>('AppNotification', AppNotificationSchema);

export default AppNotification;
