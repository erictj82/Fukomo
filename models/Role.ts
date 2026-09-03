import mongoose, { Schema, Model, models } from 'mongoose';

export interface IPermission {
    view: 'all' | 'own' | 'none';
    create: boolean;
    edit: boolean;
    delete: boolean;
}

export interface IRole {
    _id: string;
    name: string;
    description?: string;
    permissions: {
        dashboard: { view: boolean };
        appointments: IPermission;
        pos: IPermission;
        services: IPermission;
        products: IPermission;
        staff: IPermission;
        customers: IPermission;
        suppliers: IPermission;
        expenses: IPermission;
        purchases: IPermission;
        invoices: IPermission;
        deposits: IPermission;
        payroll: IPermission;
        vouchers: IPermission;
        usageLogs: IPermission;
        reports: IPermission;
        users: IPermission;
        roles: IPermission;
        staffSlots: IPermission;
        bundles: IPermission;
        packages: IPermission;
        membership: IPermission;
        waTemplates: IPermission;
        aiReports: { view: boolean };
        calendarView: { view: boolean };
        activityLogs: { view: boolean };
        settings: { view: boolean; edit: boolean };
        corrections: IPermission;
        [key: string]: any; // Allow dynamic permissions for future modules
    };
    isSystem: boolean; // Prevent deleting system roles like 'Admin'
    createdAt: Date;
    updatedAt: Date;
}

const permissionSchema = {
    view: {
        type: String,
        enum: ['all', 'own', 'none'],
        default: 'none'
    },
    create: { type: Boolean, default: false },
    edit: { type: Boolean, default: false },
    delete: { type: Boolean, default: false }
};

const RoleSchema = new Schema<IRole>(
    {
        name: {
            type: String,
            required: [true, 'Role name is required'],
            unique: true,
            trim: true,
        },
        description: {
            type: String,
            trim: true,
        },
        isSystem: {
            type: Boolean,
            default: false,
        },
        permissions: {
            type: Schema.Types.Mixed, // Use Mixed type to allow flexible permissions
            default: {
                dashboard: { view: true },
                appointments: { view: 'none', create: false, edit: false, delete: false },
                pos: { view: 'none', create: false, edit: false, delete: false },
                services: { view: 'none', create: false, edit: false, delete: false },
                products: { view: 'none', create: false, edit: false, delete: false },
                staff: { view: 'none', create: false, edit: false, delete: false },
                customers: { view: 'none', create: false, edit: false, delete: false },
                suppliers: { view: 'none', create: false, edit: false, delete: false },
                expenses: { view: 'none', create: false, edit: false, delete: false },
                purchases: { view: 'none', create: false, edit: false, delete: false },
                invoices: { view: 'none', create: false, edit: false, delete: false },
                deposits: { view: 'none', create: false, edit: false, delete: false },
                payroll: { view: 'none', create: false, edit: false, delete: false },
                vouchers: { view: 'none', create: false, edit: false, delete: false },
                usageLogs: { view: 'none', create: false, edit: false, delete: false },
                reports: { view: 'none', create: false, edit: false, delete: false },
                users: { view: 'none', create: false, edit: false, delete: false },
                roles: { view: 'none', create: false, edit: false, delete: false },
                staffSlots: { view: 'none', create: false, edit: false, delete: false },
                bundles: { view: 'none', create: false, edit: false, delete: false },
                packages: { view: 'none', create: false, edit: false, delete: false },
                membership: { view: 'none', create: false, edit: false, delete: false },
                waTemplates: { view: 'none', create: false, edit: false, delete: false },
                aiReports: { view: false },
                calendarView: { view: false },
                activityLogs: { view: false },
                settings: { view: false, edit: false },
                corrections: { view: 'none', create: false, edit: false, delete: false },
            }
        }
    },
    {
        timestamps: true,
    }
);

const Role = (models.Role as Model<IRole>) || mongoose.model<IRole>('Role', RoleSchema);

export default Role;