export interface CrmContact {
  id: string;
  name: string;
  email?: string | undefined;
  domain?: string | undefined;
  company?: string | undefined;
  phone?: string | undefined;
}

export interface CrmActivity {
  id: string;
  contactId?: string | undefined;
  type: string;
  subject?: string | undefined;
  notes?: string | undefined;
  date?: string | undefined;
}

export interface CrmConnector {
  name: string;
  fetchContacts(token: string, instanceUrl: string): AsyncGenerator<CrmContact>;
  fetchActivities(token: string, instanceUrl: string): AsyncGenerator<CrmActivity>;
}
